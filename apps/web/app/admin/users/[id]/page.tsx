import Link from 'next/link';
import { notFound } from 'next/navigation';

import { deleteUser, grantPro, revokeDevices, revokePro, setProUntil, setRole } from '@/app/admin/users/actions';
import { BarChart, lastDays } from '@/components/admin/BarChart';
import { ConfirmButton, SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, Row, Stat, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, fmtDateTime, inputCls } from '@/components/admin/ui';
import { UserAvatar } from '@/components/UserMenu';
import { Card } from '@/components/ui/card';
import { ROLES, adminLevel, isEnvAdmin, requireAdmin } from '@/lib/admin';
import { money, planLabel } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'User' };

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function AdminUser(props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const admin = await requireAdmin();
  const superAdmin = admin.level === 'super_admin';
  const { id } = await props.params;
  const { msg } = await props.searchParams;
  const u = await db.user.findUnique({ where: { id } });
  if (!u) notFound();

  const days = lastDays(30);
  const [agg, daysActive, recent, recordings, progress, tokens, orders, log] = await Promise.all([
    db.activityDay.aggregate({ where: { userId: id }, _sum: { segments: true, seconds: true }, _max: { day: true } }),
    db.activityDay.count({ where: { userId: id } }),
    db.activityDay.findMany({ where: { userId: id, day: { gte: days[0] } }, select: { day: true, segments: true } }),
    db.recording.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, sourceType: true, segmentCount: true, createdAt: true } }),
    db.progress.findMany({ where: { userId: id }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    db.extToken.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    superAdmin ? db.order.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    superAdmin ? db.adminLog.findMany({ where: { targetType: 'user', targetId: id }, orderBy: { createdAt: 'desc' }, take: 10 }) : Promise.resolve([]),
  ]);
  const plan = planLabel(u);
  const level = adminLevel(u);
  const byDay = new Map(recent.map((r) => [r.day, r.segments]));
  const spent = orders.filter((o) => o.status === 'paid' || o.status === 'refunded').reduce((n, o) => n + o.amount - o.refundedAmount, 0);
  const hidden = <input type="hidden" name="userId" value={u.id} />;

  return (
    <>
      <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">
        ← All users
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar user={u} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <AdminHeader title={u.name || u.email.split('@')[0]} description={u.email} />
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={plan.pro ? (u.lifetime ? 'lifetime' : 'pro') : 'free'} label={plan.label} />
          {level && <StatusBadge status={level} />}
        </div>
      </div>
      {msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sentences finished" value={(agg._sum.segments ?? 0).toLocaleString()} />
        <Stat label="Minutes listened" value={Math.round((agg._sum.seconds ?? 0) / 60).toLocaleString()} />
        <Stat label="Days practised" value={daysActive} hint={agg._max.day ? `Last on ${agg._max.day}` : 'Never'} />
        <Stat label="Recordings" value={recordings.length} hint={`${tokens.filter((t) => !t.revokedAt).length} browsers connected`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-sm font-medium">Sentences per day, last 30 days</p>
            <BarChart data={days.map((day) => ({ day, value: byDay.get(day) ?? 0 }))} className="mt-4" />
          </Card>

          <Section title="Profile">
            <Card className="px-5 py-2">
              <dl className="divide-y">
                <Row label="User id">
                  <code className="text-xs">{u.id}</code>
                </Row>
                <Row label="Joined">{fmtDateTime(u.createdAt)}</Row>
                <Row label="Sign-in">{[u.passwordHash && 'Password', u.image && 'Google (photo on file)', 'Email code'].filter(Boolean).join(' · ')}</Row>
                <Row label="Role">
                  {u.role}
                  {isEnvAdmin(u.email) && <span className="text-muted-foreground"> · super admin through ADMIN_EMAILS</span>}
                </Row>
              </dl>
            </Card>
          </Section>

          <Section title="Plan">
            <Card className="px-5 py-2">
              <dl className="divide-y">
                <Row label="Status">{plan.label}</Row>
                <Row label="Lifetime">{u.lifetime ? 'Yes' : 'No'}</Row>
                <Row label="Pro until">{u.lifetime ? 'Forever' : fmtDateTime(u.proUntil)}</Row>
                <Row label="Polar subscription">
                  {u.subId ? (
                    <>
                      <code className="text-xs">{u.subId}</code> · {u.subStatus}
                      {u.subCancelAtEnd && ' · cancels at period end'}
                    </>
                  ) : (
                    '—'
                  )}
                </Row>
                <Row label="Polar customer">{u.polarCustomerId ? <code className="text-xs">{u.polarCustomerId}</code> : '—'}</Row>
                {superAdmin && <Row label="Total paid">{money(spent)}</Row>}
              </dl>
            </Card>
          </Section>

          <Section title={`Recordings on the website (${recordings.length})`}>
            <TableCard empty={!recordings.length && 'No recordings.'}>
              {recordings.length > 0 && (
                <THead>
                  <Th>Title</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Sentences</Th>
                  <Th>Added</Th>
                </THead>
              )}
              <tbody>
                {recordings.map((r) => (
                  <Tr key={r.id}>
                    <Td className="max-w-xs truncate">{r.title}</Td>
                    <Td className="capitalize text-muted-foreground">{r.sourceType}</Td>
                    <Td className="text-right tabular-nums">{r.segmentCount}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(r.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableCard>
          </Section>

          <Section title="Recent practice">
            <TableCard empty={!progress.length && 'No practice yet.'}>
              {progress.length > 0 && (
                <THead>
                  <Th>Recording</Th>
                  <Th>Where</Th>
                  <Th className="text-right">Done</Th>
                  <Th className="text-right">Score</Th>
                  <Th>Updated</Th>
                </THead>
              )}
              <tbody>
                {progress.map((p) => (
                  <Tr key={p.id}>
                    <Td className="max-w-xs truncate">{p.title}</Td>
                    <Td className="text-muted-foreground">{p.source === 'web' ? 'Website' : p.site ?? 'Extension'}</Td>
                    <Td className="text-right tabular-nums">
                      {p.done}/{p.total}
                    </Td>
                    <Td className="text-right tabular-nums">{Math.round(p.scoreAvg * 100)}%</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(p.updatedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableCard>
          </Section>

          {superAdmin && (
            <Section title="Orders">
              <TableCard empty={!orders.length && 'No orders.'}>
                <tbody>
                  {orders.map((o) => (
                    <Tr key={o.id}>
                      <Td>
                        <Link href={`/admin/orders/${o.id}`} className="font-medium capitalize hover:text-primary">
                          {o.plan}
                        </Link>
                        <p className="text-xs text-muted-foreground">{o.provider === 'polar' ? 'Polar' : 'Manual'}</p>
                      </Td>
                      <Td className="tabular-nums">{money(o.amount, o.currency)}</Td>
                      <Td>
                        <StatusBadge status={o.status} />
                      </Td>
                      <Td className="text-muted-foreground">{fmtDate(o.paidAt ?? o.createdAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableCard>
            </Section>
          )}

          {superAdmin && log.length > 0 && (
            <Section title="Admin history">
              <TableCard>
                <tbody>
                  {log.map((l) => (
                    <Tr key={l.id}>
                      <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(l.createdAt)}</Td>
                      <Td>{l.summary}</Td>
                      <Td className="text-muted-foreground">{l.actorEmail}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableCard>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          {superAdmin && (
            <Card className="space-y-4 p-5">
              <h2 className="font-semibold">Pro access</h2>
              <form action={grantPro} className="flex flex-wrap gap-2">
                {hidden}
                <input type="hidden" name="plan" value="yearly" />
                <ConfirmButton variant="outline" size="sm" confirm={`Add one year of Pro to ${u.email}?`}>
                  + 1 year
                </ConfirmButton>
              </form>
              <form action={grantPro}>
                {hidden}
                <input type="hidden" name="plan" value="lifetime" />
                <ConfirmButton variant="outline" size="sm" confirm={`Give ${u.email} lifetime Pro?`} disabled={u.lifetime}>
                  Grant lifetime
                </ConfirmButton>
              </form>
              <form action={setProUntil} className="flex items-end gap-2">
                {hidden}
                <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
                  Pro until (end of day, UTC)
                  <input type="date" name="until" required defaultValue={u.proUntil?.toISOString().slice(0, 10)} className={inputCls} />
                </label>
                <SubmitButton size="sm" variant="outline">
                  Set
                </SubmitButton>
              </form>
              <form action={revokePro} className="space-y-1.5">
                {hidden}
                <ConfirmButton variant="outline" size="sm" className="text-destructive" confirm={`Remove Pro from ${u.email} now?`} disabled={!plan.pro}>
                  Remove Pro
                </ConfirmButton>
                {u.subId && <p className="text-xs text-muted-foreground">This doesn’t cancel the Polar subscription; a renewal would bring Pro back.</p>}
              </form>
            </Card>
          )}

          {superAdmin && (
            <Card className="space-y-3 p-5">
              <h2 className="font-semibold">Role</h2>
              <form action={setRole} className="flex gap-2">
                {hidden}
                <select name="role" defaultValue={u.role} className={`${inputCls} flex-1`} disabled={u.id === admin.id}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <SubmitButton size="sm" variant="outline" disabled={u.id === admin.id}>
                  Save
                </SubmitButton>
              </form>
              <p className="text-xs text-muted-foreground">Admins run content and support. Super admins also see billing, change roles and delete accounts.</p>
            </Card>
          )}

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Extension browsers</h2>
            {tokens.length ? (
              <ul className="space-y-2 text-sm">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-2">
                    <span>
                      {t.label ?? 'Browser'}
                      <span className="block text-xs text-muted-foreground">
                        Connected {fmtDate(t.createdAt)} · last used {fmtDate(t.lastUsedAt)}
                      </span>
                    </span>
                    <StatusBadge status={t.revokedAt ? 'off' : 'active'} label={t.revokedAt ? 'revoked' : 'active'} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None connected.</p>
            )}
            {tokens.some((t) => !t.revokedAt) && (
              <form action={revokeDevices}>
                {hidden}
                <ConfirmButton variant="outline" size="sm" confirm="Disconnect every browser? They’ll have to connect again.">
                  Disconnect all
                </ConfirmButton>
              </form>
            )}
          </Card>

          {superAdmin && u.id !== admin.id && (
            <Card className="space-y-3 border-destructive/40 p-5">
              <h2 className="font-semibold text-destructive">Delete account</h2>
              <p className="text-xs text-muted-foreground">Removes the account, uploaded recordings and all progress. Orders stay, without the link to the account.</p>
              <form action={deleteUser} className="space-y-2">
                {hidden}
                <input name="confirm" placeholder={`Type ${u.email}`} className={`${inputCls} w-full`} autoComplete="off" />
                <ConfirmButton variant="destructive" size="sm" confirm={`Permanently delete ${u.email}? This can’t be undone.`}>
                  Delete account
                </ConfirmButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
