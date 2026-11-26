import Link from 'next/link';

import { createOrder } from '@/app/admin/orders/actions';
import { SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, inputCls } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { PRICE_CENTS, couponLabel, money } from '@/lib/billing';
import { db } from '@/lib/db';

export const metadata = { title: 'New order' };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export default async function NewOrder(props: { searchParams: Promise<{ email?: string; msg?: string }> }) {
  await requireAdmin('super_admin');
  const sp = await props.searchParams;
  const coupons = await db.coupon.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' }, take: 20 });

  return (
    <>
      <Link href="/admin/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← All orders
      </Link>
      <AdminHeader title="New manual order" description="For payments outside Polar, like a bank transfer, or a gift." />
      {sp.msg && <p className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-2.5 text-sm">{sp.msg}</p>}
      <Card className="max-w-xl p-6">
        <form action={createOrder} className="grid gap-5">
          <Field label="Customer email" hint="The account must exist already.">
            <input name="email" type="email" required defaultValue={sp.email} className={inputCls} />
          </Field>
          <Field label="Plan">
            <select name="plan" className={inputCls} defaultValue="yearly">
              <option value="yearly">Pro yearly · {money(PRICE_CENTS.yearly)} (adds a year)</option>
              <option value="lifetime">Pro lifetime · {money(PRICE_CENTS.lifetime)}</option>
            </select>
          </Field>
          <Field label="Coupon" hint={coupons.length ? `Active: ${coupons.map((c) => `${c.code} (${couponLabel(c)})`).join(', ')}` : 'No active coupons.'}>
            <input name="coupon" className={`${inputCls} uppercase`} placeholder="Optional" />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="Amount paid" hint="Empty: the list price, less the coupon.">
              <input name="amount" inputMode="decimal" placeholder="e.g. 24 or 550000" className={inputCls} />
            </Field>
            <Field label="Currency">
              <input name="currency" defaultValue="usd" maxLength={3} className={`${inputCls} uppercase`} />
            </Field>
          </div>
          <Field label="Status">
            <select name="status" className={inputCls} defaultValue="pending">
              <option value="pending">Pending: waiting for the money</option>
              <option value="paid">Paid: grant Pro now</option>
            </select>
          </Field>
          <Field label="Note" hint="Bank reference, who asked, why it was a gift…">
            <textarea name="note" rows={3} className={`${inputCls} h-auto py-2`} />
          </Field>
          <div>
            <SubmitButton>Create order</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
