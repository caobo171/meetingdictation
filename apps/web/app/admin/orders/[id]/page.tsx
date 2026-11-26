import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cancelOrder, markPaid, refundOrder, saveNote } from '@/app/admin/orders/actions';
import { ConfirmButton, SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, Row, StatusBadge, TableCard, Td, Tr, fmtDateTime, inputCls } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { money, planLabel } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Order' };

export default async function AdminOrder(props: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin('super_admin');
  const { id } = await props.params;
  const { msg } = await props.searchParams;
  const o = await db.order.findUnique({ where: { id }, include: { user: true } });
  if (!o) notFound();
  const log = await db.adminLog.findMany({ where: { targetType: 'order', targetId: id }, orderBy: { createdAt: 'desc' } });
  const manual = o.provider === 'manual';
  const hidden = <input type="hidden" name="orderId" value={o.id} />;

  return (
    <>
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← All orders
      </Link>
      <AdminHeader
        title={`Order ${o.id.slice(-8)}`}
        description={`${manual ? 'Manual order' : 'Polar order'} · ${o.plan === 'lifetime' ? 'Pro lifetime' : 'Pro yearly'}`}
        action={<StatusBadge status={o.status} />}
      />
      {msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="px-5 py-2">
            <dl className="divide-y">
              <Row label="Order id">
                <code className="text-xs">{o.id}</code>
              </Row>
              {o.providerId && (
                <Row label="Polar order id">
                  <code className="text-xs">{o.providerId}</code>
                </Row>
              )}
              <Row label="Customer">
                {o.user ? (
                  <Link href={`/admin/users/${o.user.id}`} className="text-primary hover:underline">
                    {o.user.email}
                  </Link>
                ) : (
                  <span>{o.email || '—'} (account deleted)</span>
                )}
                {o.user && <span className="text-muted-foreground"> · now {planLabel(o.user).label}</span>}
              </Row>
              <Row label="Plan">{o.plan === 'lifetime' ? 'Pro lifetime' : 'Pro yearly'}</Row>
              <Row label="Amount">
                {money(o.amount, o.currency)}
                {o.refundedAmount > 0 && <span className="text-destructive"> · refunded {money(o.refundedAmount, o.currency)}</span>}
              </Row>
              <Row label="Coupon">{o.couponCode ?? '—'}</Row>
              <Row label="Reason">{o.reason ?? '—'}</Row>
              <Row label="Created">{fmtDateTime(o.createdAt)}</Row>
              <Row label="Paid">{fmtDateTime(o.paidAt)}</Row>
              {o.createdBy && <Row label="Created by">{o.createdBy}</Row>}
            </dl>
          </Card>

          {manual ? (
            <Card className="space-y-3 p-5">
              <h2 className="font-semibold">Note</h2>
              <form action={saveNote} className="space-y-2">
                {hidden}
                <textarea name="note" rows={3} defaultValue={o.note ?? ''} className={`${inputCls} h-auto w-full py-2`} />
                <SubmitButton size="sm" variant="outline">
                  Save note
                </SubmitButton>
              </form>
            </Card>
          ) : (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              Polar is the source of truth for this order: refunds and receipts are handled in the Polar dashboard, and the webhook updates it here.
            </p>
          )}

          {log.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">History</h2>
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
            </section>
          )}
        </div>

        {manual && (
          <aside className="space-y-4">
            {o.status === 'pending' && (
              <Card className="space-y-3 p-5">
                <h2 className="font-semibold">Payment arrived?</h2>
                <p className="text-sm text-muted-foreground">Marking it paid grants the plan and counts the coupon as used.</p>
                <form action={markPaid}>
                  {hidden}
                  <ConfirmButton confirm={`Mark paid and give ${o.email} ${o.plan === 'lifetime' ? 'lifetime Pro' : 'a year of Pro'}?`}>Mark paid</ConfirmButton>
                </form>
                <form action={cancelOrder}>
                  {hidden}
                  <ConfirmButton variant="outline" size="sm" confirm="Cancel this pending order?">
                    Cancel order
                  </ConfirmButton>
                </form>
              </Card>
            )}
            {o.status === 'paid' && (
              <Card className="space-y-3 p-5">
                <h2 className="font-semibold">Refund</h2>
                <p className="text-sm text-muted-foreground">Records that you sent the money back. It doesn’t move any money itself.</p>
                <form action={refundOrder} className="space-y-3">
                  {hidden}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="removePro" defaultChecked /> Also remove Pro
                  </label>
                  <ConfirmButton variant="outline" className="text-destructive" confirm={`Record a refund of ${money(o.amount, o.currency)} to ${o.email}?`}>
                    Record refund
                  </ConfirmButton>
                </form>
              </Card>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
