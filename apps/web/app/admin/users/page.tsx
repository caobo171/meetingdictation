import type { Prisma } from '@prisma/client';
import Link from 'next/link';

import { AdminHeader, Filters, PAGE, Pager, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, inputCls, pageOf } from '@/components/admin/ui';
import { UserAvatar } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { adminLevel, requireAdmin } from '@/lib/admin';
import { planLabel } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Users' };

type SP = { q?: string; plan?: string; role?: string; sort?: string; page?: string; msg?: string };

export default async function AdminUsers(props: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await props.searchParams;
  const page = pageOf(sp.page);
  const now = new Date();

  const where: Prisma.UserWhereInput = {};
  if (sp.q) where.OR = [{ email: { contains: sp.q, mode: 'insensitive' } }, { name: { contains: sp.q, mode: 'insensitive' } }, { id: sp.q }];
  if (sp.plan === 'pro') where.AND = [{ OR: [{ lifetime: true }, { proUntil: { gt: now } }] }];
  if (sp.plan === 'free') where.AND = [{ lifetime: false }, { OR: [{ proUntil: null }, { proUntil: { lte: now } }] }];
  if (sp.plan === 'lifetime') where.lifetime = true;
  if (sp.plan === 'trial') Object.assign(where, { subStatus: 'trialing', proUntil: { gt: now } });
  if (sp.role === 'staff') where.role = { in: ['admin', 'super_admin'] };

  const orderBy: Prisma.UserOrderByWithRelationInput = sp.sort === 'oldest' ? { createdAt: 'asc' } : sp.sort === 'email' ? { email: 'asc' } : { createdAt: 'desc' };
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { _count: { select: { recordings: true, progress: true } } },
    }),
  ]);
  const ids = users.map((u) => u.id);
  const activity = ids.length
    ? await db.activityDay.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { day: true }, _sum: { segments: true } })
    : [];
  const act = new Map(activity.map((a) => [a.userId, a]));
  const params = { q: sp.q, plan: sp.plan, role: sp.role, sort: sp.sort };

  return (
    <>
      <AdminHeader title="Users" description="Everyone with an account. Search by email, name or id." />
      {sp.msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{sp.msg}</p>}
      <Filters>
        <input name="q" defaultValue={sp.q} placeholder="Email, name or id…" className={`${inputCls} w-64`} />
        <select name="plan" defaultValue={sp.plan ?? ''} className={inputCls}>
          <option value="">All plans</option>
          <option value="pro">Pro now</option>
          <option value="trial">On trial</option>
          <option value="lifetime">Lifetime</option>
          <option value="free">Free</option>
        </select>
        <select name="role" defaultValue={sp.role ?? ''} className={inputCls}>
          <option value="">Any role</option>
          <option value="staff">Admins</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? ''} className={inputCls}>
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="email">Email A–Z</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </Filters>

      <TableCard empty={!users.length && 'No users match.'}>
        <THead>
          <Th>User</Th>
          <Th>Joined</Th>
          <Th>Plan</Th>
          <Th>Role</Th>
          <Th className="text-right">Recordings</Th>
          <Th className="text-right">Sentences</Th>
          <Th>Last active</Th>
        </THead>
        <tbody>
          {users.map((u) => {
            const plan = planLabel(u);
            const level = adminLevel(u);
            const a = act.get(u.id);
            return (
              <Tr key={u.id}>
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3">
                    <UserAvatar user={u} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-primary">{u.name || u.email.split('@')[0]}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </span>
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(u.createdAt)}</Td>
                <Td>
                  <StatusBadge status={plan.pro ? (u.lifetime ? 'lifetime' : u.subStatus === 'trialing' ? 'trial' : 'pro') : 'free'} label={plan.label} />
                </Td>
                <Td>{level ? <StatusBadge status={level} /> : <span className="text-muted-foreground">user</span>}</Td>
                <Td className="text-right tabular-nums">{u._count.recordings}</Td>
                <Td className="text-right tabular-nums">{(a?._sum.segments ?? 0).toLocaleString()}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{a?._max.day ?? '—'}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={params} base="/admin/users" />
    </>
  );
}
