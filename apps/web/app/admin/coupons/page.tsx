import { createCoupon, deleteCoupon, toggleCoupon } from '@/app/admin/coupons/actions';
import { ConfirmButton, SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, StatusBadge, TableCard, Td, THead, Th, Tr, fmtDate, inputCls } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { couponLabel } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'Coupons' };

export default async function AdminCoupons(props: { searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin('super_admin');
  const { msg } = await props.searchParams;
  const coupons = await db.coupon.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] });
  const now = new Date();

  return (
    <>
      <AdminHeader
        title="Coupons"
        description="Discount codes for manual orders. Codes typed at Polar’s checkout are Polar discounts, set up in the Polar dashboard."
      />
      {msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{msg}</p>}

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">New coupon</h2>
        <form action={createCoupon} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Code
            <input name="code" required placeholder="SPRING20" className={`${inputCls} uppercase`} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Name (internal)
            <input name="name" placeholder="Spring promo" className={inputCls} />
          </label>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Discount
              <select name="kind" className={inputCls}>
                <option value="percent">% off</option>
                <option value="amount">$ off</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Value
              <input name="value" required inputMode="decimal" placeholder="20" className={inputCls} />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Plan
            <select name="plan" className={inputCls}>
              <option value="">Any plan</option>
              <option value="yearly">Yearly only</option>
              <option value="lifetime">Lifetime only</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Max uses
            <input name="maxUses" inputMode="numeric" placeholder="Unlimited" className={inputCls} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Expires
            <input name="expiresAt" type="date" className={inputCls} />
          </label>
          <div className="flex items-end">
            <SubmitButton>Create coupon</SubmitButton>
          </div>
        </form>
      </Card>

      <TableCard empty={!coupons.length && 'No coupons yet.'}>
        <THead>
          <Th>Code</Th>
          <Th>Discount</Th>
          <Th>Plan</Th>
          <Th className="text-right">Used</Th>
          <Th>Expires</Th>
          <Th>Status</Th>
          <Th className="text-right">Actions</Th>
        </THead>
        <tbody>
          {coupons.map((c) => {
            const expired = !!c.expiresAt && c.expiresAt < now;
            const usedUp = c.maxUses != null && c.used >= c.maxUses;
            const status = !c.active ? 'off' : expired ? 'canceled' : usedUp ? 'canceled' : 'active';
            return (
              <Tr key={c.id}>
                <Td>
                  <span className="font-mono font-medium">{c.code}</span>
                  {c.name && <p className="text-xs text-muted-foreground">{c.name}</p>}
                </Td>
                <Td>{couponLabel(c)}</Td>
                <Td className="capitalize text-muted-foreground">{c.plan ?? 'any'}</Td>
                <Td className="text-right tabular-nums">
                  {c.used}
                  {c.maxUses != null && <span className="text-muted-foreground"> / {c.maxUses}</span>}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(c.expiresAt)}</Td>
                <Td>
                  <StatusBadge status={status} label={!c.active ? 'off' : expired ? 'expired' : usedUp ? 'used up' : 'active'} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <form action={toggleCoupon}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton size="sm" variant="outline">
                        {c.active ? 'Turn off' : 'Turn on'}
                      </SubmitButton>
                    </form>
                    {c.used === 0 && (
                      <form action={deleteCoupon}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton size="sm" variant="outline" className="text-destructive" confirm={`Delete coupon ${c.code}?`}>
                          Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
    </>
  );
}
