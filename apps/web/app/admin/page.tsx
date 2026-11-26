import Link from 'next/link';

import { BarChart, lastDays } from '@/components/admin/BarChart';
import { AdminHeader, Stat, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, fmtDateTime } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { money } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Dashboard' };

const DAY = 86400000;

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  const superAdmin = admin.level === 'super_admin';
  const now = new Date();
  const days = lastDays(30);
  const since30 = new Date(`${days[0]}T00:00:00Z`);
  const since7 = new Date(now.getTime() - 7 * DAY);

  const [users, new7, new30, pro, trials, lifetime, active7, totals, recordings, signups, activeRows, revenueRows, revenue30, revenueAll, recentUsers, recentOrders, recentLog, pendingOrders] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: since7 } } }),
      db.user.count({ where: { createdAt: { gte: since30 } } }),
      db.user.count({ where: { OR: [{ lifetime: true }, { proUntil: { gt: now } }] } }),
      db.user.count({ where: { subStatus: 'trialing', proUntil: { gt: now } } }),
      db.user.count({ where: { lifetime: true } }),
      db.activityDay.groupBy({ by: ['userId'], where: { day: { gte: lastDays(7)[0] } } }).then((r) => r.length),
      db.activityDay.aggregate({ _sum: { segments: true, seconds: true } }),
      db.recording.count(),
      db.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS n
        FROM "User" WHERE "createdAt" >= ${since30} GROUP BY 1`,
      db.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT day, count(DISTINCT "userId") AS n FROM "ActivityDay" WHERE day >= ${days[0]} GROUP BY day`,
      db.$queryRaw<{ day: string; cents: bigint }[]>`
        SELECT to_char("paidAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, sum(amount - "refundedAmount") AS cents
        FROM "Order" WHERE "paidAt" >= ${since30} AND status IN ('paid', 'refunded') GROUP BY 1`,
      db.order.groupBy({ by: ['currency'], where: { paidAt: { gte: since30 }, status: { in: ['paid', 'refunded'] } }, _sum: { amount: true, refundedAmount: true } }),
      db.order.groupBy({ by: ['currency'], where: { status: { in: ['paid', 'refunded'] } }, _sum: { amount: true, refundedAmount: true }, _count: true }),
      db.user.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, email: true, name: true, createdAt: true } }),
      superAdmin
        ? db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, email: true, plan: true, amount: true, currency: true, status: true, createdAt: true } })
        : Promise.resolve([]),
      superAdmin ? db.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }) : Promise.resolve([]),
      superAdmin ? db.order.count({ where: { status: 'pending' } }) : Promise.resolve(0),
    ]);

  const series = (rows: { day: string; n?: bigint; cents?: bigint }[], key: 'n' | 'cents') => {
    const m = new Map(rows.map((r) => [r.day, Number(r[key] ?? 0)]));
    return days.map((day) => ({ day, value: m.get(day) ?? 0 }));
  };
  const sumMoney = (rows: { currency: string; _sum: { amount: number | null; refundedAmount: number | null } }[]) =>
    rows.length ? rows.map((r) => money((r._sum.amount ?? 0) - (r._sum.refundedAmount ?? 0), r.currency)).join(' + ') : money(0);
  const paidOrders = revenueAll.reduce((n, r) => n + r._count, 0);

  return (
    <>
      <AdminHeader title="Dashboard" description={`Signed in as ${admin.email}. Figures in UTC.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={users.toLocaleString()} hint={`+${new7} this week · +${new30} in 30 days`} />
        <Stat label="Active learners (7 days)" value={active7.toLocaleString()} hint={`${users ? Math.round((active7 / users) * 100) : 0}% of all users`} />
        <Stat label="Pro now" value={pro.toLocaleString()} hint={`${lifetime} lifetime · ${trials} on trial`} />
        {superAdmin ? (
          <Stat label="Revenue (30 days)" value={sumMoney(revenue30)} hint={`${sumMoney(revenueAll)} all time · ${paidOrders} orders`} />
        ) : (
          <Stat label="Recordings" value={recordings.toLocaleString()} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-medium">Sign-ups per day</p>
          <BarChart data={series(signups, 'n')} className="mt-4" />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium">Active learners per day</p>
          <BarChart data={series(activeRows, 'n')} className="mt-4" />
        </Card>
        {superAdmin ? (
          <Card className="p-5">
            <p className="text-sm font-medium">Revenue per day</p>
            <BarChart data={series(revenueRows, 'cents')} format={(c) => money(c)} className="mt-4" />
          </Card>
        ) : (
          <Card className="p-5">
            <p className="text-sm font-medium">Practice so far</p>
            <p className="mt-4 text-2xl font-semibold tabular-nums">{(totals._sum.segments ?? 0).toLocaleString()} sentences</p>
            <p className="text-sm text-muted-foreground">{Math.round((totals._sum.seconds ?? 0) / 60).toLocaleString()} minutes listened</p>
          </Card>
        )}
      </div>

      {superAdmin && pendingOrders > 0 && (
        <Link href="/admin/orders?status=pending" className="block rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <span className="font-medium">{pendingOrders} pending {pendingOrders === 1 ? 'order' : 'orders'}</span> waiting for payment to be confirmed →
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">New users</h2>
            <Link href="/admin/users" className="text-sm text-primary hover:underline">
              All users
            </Link>
          </div>
          <TableCard>
            <tbody>
              {recentUsers.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-primary">
                      {u.name || u.email}
                    </Link>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </Td>
                  <Td className="text-right text-muted-foreground">{fmtDate(u.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </section>

        {superAdmin ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Latest orders</h2>
              <Link href="/admin/orders" className="text-sm text-primary hover:underline">
                All orders
              </Link>
            </div>
            <TableCard empty={!recentOrders.length && 'No orders yet.'}>
              <tbody>
                {recentOrders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:text-primary">
                        {o.email || '—'}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">{o.plan}</p>
                    </Td>
                    <Td className="tabular-nums">{money(o.amount, o.currency)}</Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableCard>
          </section>
        ) : null}
      </div>

      {superAdmin && recentLog.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent admin activity</h2>
            <Link href="/admin/audit" className="text-sm text-primary hover:underline">
              Audit log
            </Link>
          </div>
          <TableCard>
            <THead>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
            </THead>
            <tbody>
              {recentLog.map((l) => (
                <Tr key={l.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(l.createdAt)}</Td>
                  <Td className="text-muted-foreground">{l.actorEmail}</Td>
                  <Td>{l.summary}</Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </section>
      )}
    </>
  );
}
