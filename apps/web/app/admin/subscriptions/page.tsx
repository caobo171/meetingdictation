import type { Prisma } from '@prisma/client';
import Link from 'next/link';

import { AdminHeader, Filters, PAGE, Pager, Stat, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, inputCls, pageOf } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin';
import { PRICE_CENTS, money, planLabel } from '@/lib/billing';
import { db } from '@/lib/db';
import { PLANS } from '@/lib/polar';

export const metadata = { title: 'Subscriptions' };

type SP = { status?: string; q?: string; page?: string };

/** Who has Pro and on what terms: Polar subscriptions, lifetime, and Pro given by hand. */
export default async function AdminSubscriptions(props: { searchParams: Promise<SP> }) {
  await requireAdmin('super_admin');
  const sp = await props.searchParams;
  const page = pageOf(sp.page);
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86400000);

  const base: Prisma.UserWhereInput = { OR: [{ lifetime: true }, { subId: { not: null } }, { proUntil: { not: null } }] };
  const byStatus: Record<string, Prisma.UserWhereInput> = {
    active: { subStatus: 'active', proUntil: { gt: now } },
    trialing: { subStatus: 'trialing', proUntil: { gt: now } },
    past_due: { subStatus: 'past_due' },
    canceling: { subCancelAtEnd: true, proUntil: { gt: now } },
    expiring: { lifetime: false, proUntil: { gt: now, lte: soon } },
    lifetime: { lifetime: true },
    manual: { subId: null, lifetime: false, proUntil: { gt: now } },
    ended: { lifetime: false, proUntil: { lte: now } },
  };
  const where: Prisma.UserWhereInput = { AND: [base, sp.status ? byStatus[sp.status] ?? {} : {}, sp.q ? { email: { contains: sp.q, mode: 'insensitive' } } : {}] };

  const [total, users, counts] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({ where, orderBy: [{ lifetime: 'desc' }, { proUntil: 'asc' }], skip: (page - 1) * PAGE, take: PAGE }),
    Promise.all(Object.entries(byStatus).map(async ([k, w]) => [k, await db.user.count({ where: { AND: [base, w] } })] as const)),
  ]);
  const c = Object.fromEntries(counts);
  const arr = (c.active ?? 0) * PRICE_CENTS.yearly;

  return (
    <>
      <AdminHeader title="Subscriptions" description={`Plans: ${PLANS.yearly.name} (${money(PRICE_CENTS.yearly)} a year, 7-day trial) and ${PLANS.lifetime.name} (${money(PRICE_CENTS.lifetime)} once), sold through Polar.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paying yearly" value={c.active ?? 0} hint={`${money(arr)} a year at list price`} />
        <Stat label="On trial" value={c.trialing ?? 0} />
        <Stat label="Lifetime" value={c.lifetime ?? 0} />
        <Stat label="Cancelling · past due" value={`${c.canceling ?? 0} · ${c.past_due ?? 0}`} hint={`${c.expiring ?? 0} end in the next 14 days`} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[['', 'All'], ['active', 'Active'], ['trialing', 'Trial'], ['canceling', 'Cancelling'], ['past_due', 'Past due'], ['expiring', 'Ending soon'], ['lifetime', 'Lifetime'], ['manual', 'Given by hand'], ['ended', 'Ended']].map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/admin/subscriptions?status=${k}` : '/admin/subscriptions'}
            className={`rounded-full border px-3 py-1 text-sm ${(sp.status ?? '') === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
            {k && <span className="ml-1.5 tabular-nums opacity-70">{c[k] ?? 0}</span>}
          </Link>
        ))}
      </div>
      <Filters>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input name="q" defaultValue={sp.q} placeholder="Email…" className={`${inputCls} w-64`} />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </Filters>
      <TableCard empty={!users.length && 'Nobody here.'}>
        <THead>
          <Th>Learner</Th>
          <Th>Plan</Th>
          <Th>Polar status</Th>
          <Th>Pro until</Th>
          <Th>Subscription</Th>
        </THead>
        <tbody>
          {users.map((u) => {
            const plan = planLabel(u);
            return (
              <Tr key={u.id}>
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-primary">
                    {u.email}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={plan.pro ? (u.lifetime ? 'lifetime' : 'pro') : 'free'} label={plan.label} />
                </Td>
                <Td>{u.subStatus ? <StatusBadge status={u.subStatus} /> : <span className="text-muted-foreground">—</span>}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{u.lifetime ? 'Forever' : fmtDate(u.proUntil)}</Td>
                <Td className="font-mono text-xs text-muted-foreground">{u.subId ?? (u.lifetime ? 'lifetime' : 'manual')}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={{ status: sp.status, q: sp.q }} base="/admin/subscriptions" />
    </>
  );
}
