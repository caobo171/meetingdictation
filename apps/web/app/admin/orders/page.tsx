import type { Prisma } from '@prisma/client';
import Link from 'next/link';

import { importFromPolar } from '@/app/admin/orders/actions';
import { SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, Filters, PAGE, Pager, Stat, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, inputCls, pageOf } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin';
import { ORDER_STATUSES, money } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Orders' };

type SP = { q?: string; status?: string; provider?: string; plan?: string; from?: string; to?: string; page?: string; msg?: string };

export default async function AdminOrders(props: { searchParams: Promise<SP> }) {
  await requireAdmin('super_admin');
  const sp = await props.searchParams;
  const page = pageOf(sp.page);

  const where: Prisma.OrderWhereInput = {};
  if (sp.q) where.OR = [{ email: { contains: sp.q, mode: 'insensitive' } }, { id: sp.q }, { providerId: sp.q }, { couponCode: { equals: sp.q, mode: 'insensitive' } }];
  if (sp.status && (ORDER_STATUSES as readonly string[]).includes(sp.status)) where.status = sp.status;
  if (sp.provider === 'polar' || sp.provider === 'manual') where.provider = sp.provider;
  if (sp.plan === 'yearly' || sp.plan === 'lifetime') where.plan = sp.plan;
  const created: Prisma.DateTimeFilter = {};
  if (sp.from) created.gte = new Date(`${sp.from}T00:00:00Z`);
  if (sp.to) created.lte = new Date(`${sp.to}T23:59:59Z`);
  if (sp.from || sp.to) where.createdAt = created;

  const [total, orders, sums] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    db.order.groupBy({ by: ['status', 'currency'], where, _sum: { amount: true, refundedAmount: true }, _count: true }),
  ]);
  const paid = sums.filter((s) => s.status === 'paid' || s.status === 'refunded');
  const net = paid.length ? paid.map((s) => money((s._sum.amount ?? 0) - (s._sum.refundedAmount ?? 0), s.currency)).join(' + ') : money(0);
  const count = (st: string) => sums.filter((s) => s.status === st).reduce((n, s) => n + s._count, 0);
  const params = { q: sp.q, status: sp.status, provider: sp.provider, plan: sp.plan, from: sp.from, to: sp.to };

  return (
    <>
      <AdminHeader
        title="Orders"
        description="Polar payments arrive by webhook. Manual orders (bank transfer, gifts) are created here."
        action={
          <>
            <form action={importFromPolar}>
              <SubmitButton variant="outline">Import from Polar</SubmitButton>
            </form>
            <Button asChild>
              <Link href="/admin/orders/new">New manual order</Link>
            </Button>
          </>
        }
      />
      {sp.msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{sp.msg}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net revenue (filtered)" value={net} />
        <Stat label="Paid" value={count('paid')} />
        <Stat label="Pending" value={count('pending')} />
        <Stat label="Refunded · canceled" value={`${count('refunded')} · ${count('canceled')}`} />
      </div>

      <Filters>
        <input name="q" defaultValue={sp.q} placeholder="Email, order id or coupon…" className={`${inputCls} w-60`} />
        <select name="status" defaultValue={sp.status ?? ''} className={inputCls}>
          <option value="">Any status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="provider" defaultValue={sp.provider ?? ''} className={inputCls}>
          <option value="">Polar and manual</option>
          <option value="polar">Polar</option>
          <option value="manual">Manual</option>
        </select>
        <select name="plan" defaultValue={sp.plan ?? ''} className={inputCls}>
          <option value="">Any plan</option>
          <option value="yearly">Yearly</option>
          <option value="lifetime">Lifetime</option>
        </select>
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={sp.from} className={inputCls} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={sp.to} className={inputCls} />
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </Filters>

      <TableCard empty={!orders.length && 'No orders match.'}>
        <THead>
          <Th>Order</Th>
          <Th>Customer</Th>
          <Th>Plan</Th>
          <Th className="text-right">Amount</Th>
          <Th>Status</Th>
          <Th>Coupon</Th>
          <Th>Created</Th>
        </THead>
        <tbody>
          {orders.map((o) => (
            <Tr key={o.id}>
              <Td>
                <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs hover:text-primary">
                  {o.id.slice(-8)}
                </Link>
                <p className="text-xs text-muted-foreground">{o.provider === 'polar' ? 'Polar' : 'Manual'}</p>
              </Td>
              <Td>
                {o.userId ? (
                  <Link href={`/admin/users/${o.userId}`} className="hover:text-primary">
                    {o.email}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{o.email || 'Deleted account'}</span>
                )}
              </Td>
              <Td className="capitalize">{o.plan}</Td>
              <Td className="text-right tabular-nums">
                {money(o.amount, o.currency)}
                {o.refundedAmount > 0 && <p className="text-xs text-destructive">−{money(o.refundedAmount, o.currency)}</p>}
              </Td>
              <Td>
                <StatusBadge status={o.status} />
              </Td>
              <Td className="font-mono text-xs">{o.couponCode ?? '—'}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(o.createdAt)}</Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={params} base="/admin/orders" />
    </>
  );
}
