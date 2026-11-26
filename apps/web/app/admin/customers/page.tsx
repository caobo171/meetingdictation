import Link from 'next/link';

import { AdminHeader, Filters, PAGE, Pager, Stat, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, inputCls, pageOf } from '@/components/admin/ui';
import { UserAvatar } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin';
import { money, planLabel } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Customers' };

/**
 * A customer is anyone who has paid: an order on record, a Polar customer id, a subscription or lifetime Pro.
 * Lifetime value is net of refunds, in USD (orders in other currencies are counted separately).
 */
export default async function AdminCustomers(props: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  await requireAdmin('super_admin');
  const sp = await props.searchParams;
  const page = pageOf(sp.page);

  const sums = await db.order.groupBy({
    by: ['userId', 'currency'],
    where: { userId: { not: null }, status: { in: ['paid', 'refunded'] } },
    _sum: { amount: true, refundedAmount: true },
    _count: true,
    _min: { paidAt: true },
    _max: { paidAt: true },
  });
  const users = await db.user.findMany({
    where: {
      AND: [
        { OR: [{ id: { in: sums.map((s) => s.userId!) } }, { polarCustomerId: { not: null } }, { lifetime: true }, { subId: { not: null } }] },
        sp.q ? { OR: [{ email: { contains: sp.q, mode: 'insensitive' } }, { name: { contains: sp.q, mode: 'insensitive' } }] } : {},
      ],
    },
    select: { id: true, email: true, name: true, image: true, createdAt: true, lifetime: true, proUntil: true, subId: true, subStatus: true, subCancelAtEnd: true, polarCustomerId: true },
  });

  const rows = users.map((u) => {
    const mine = sums.filter((s) => s.userId === u.id);
    const usd = mine.filter((s) => s.currency === 'usd').reduce((n, s) => n + (s._sum.amount ?? 0) - (s._sum.refundedAmount ?? 0), 0);
    const other = mine.filter((s) => s.currency !== 'usd').map((s) => money((s._sum.amount ?? 0) - (s._sum.refundedAmount ?? 0), s.currency));
    const firsts = mine.map((s) => s._min.paidAt).filter(Boolean) as Date[];
    const lasts = mine.map((s) => s._max.paidAt).filter(Boolean) as Date[];
    return {
      u,
      usd,
      other,
      orders: mine.reduce((n, s) => n + s._count, 0),
      first: firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null,
      last: lasts.length ? new Date(Math.max(...lasts.map((d) => d.getTime()))) : null,
      plan: planLabel(u),
    };
  });
  rows.sort((a, b) =>
    sp.sort === 'recent' ? (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) : b.usd - a.usd || (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0),
  );
  const total = rows.length;
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const ltv = rows.reduce((n, r) => n + r.usd, 0);
  const payingNow = rows.filter((r) => r.plan.pro).length;

  return (
    <>
      <AdminHeader title="Customers" description="Everyone who has paid, with what they have spent." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Customers" value={total} />
        <Stat label="With Pro now" value={payingNow} />
        <Stat label="Average spent" value={money(total ? Math.round(ltv / total) : 0)} hint={`${money(ltv)} in all (USD orders)`} />
      </div>
      <Filters>
        <input name="q" defaultValue={sp.q} placeholder="Email or name…" className={`${inputCls} w-64`} />
        <select name="sort" defaultValue={sp.sort ?? ''} className={inputCls}>
          <option value="">Most spent</option>
          <option value="recent">Latest payment</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </Filters>
      <TableCard empty={!shown.length && 'No customers yet.'}>
        <THead>
          <Th>Customer</Th>
          <Th>Plan now</Th>
          <Th className="text-right">Orders</Th>
          <Th className="text-right">Spent</Th>
          <Th>First paid</Th>
          <Th>Last paid</Th>
        </THead>
        <tbody>
          {shown.map(({ u, usd, other, orders, first, last, plan }) => (
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
              <Td>
                <StatusBadge status={plan.pro ? (u.lifetime ? 'lifetime' : 'pro') : 'free'} label={plan.label} />
              </Td>
              <Td className="text-right tabular-nums">
                <Link href={`/admin/orders?q=${encodeURIComponent(u.email)}`} className="hover:text-primary">
                  {orders}
                </Link>
              </Td>
              <Td className="text-right tabular-nums">
                {money(usd)}
                {other.length > 0 && <p className="text-xs text-muted-foreground">+ {other.join(' + ')}</p>}
              </Td>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(first)}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(last)}</Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={{ q: sp.q, sort: sp.sort }} base="/admin/customers" />
    </>
  );
}
