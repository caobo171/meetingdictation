'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit, requireAdmin } from '@/lib/admin';
import { PRICE_CENTS, applyCoupon, grantPlan, money, removePro } from '@/lib/billing';
import { db } from '@/lib/db';
import { importPolarOrders } from '@/lib/polar';

const go = (path: string, msg: string): never => {
  revalidatePath('/admin/orders');
  redirect(`${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`);
};

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  plan: z.enum(['yearly', 'lifetime']),
  amount: z.string().trim(),
  currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/),
  coupon: z.string().trim().toUpperCase(),
  status: z.enum(['pending', 'paid']),
  note: z.string().trim().max(500),
});

/** A manual order, e.g. a bank transfer. Paid straight away grants the plan; pending waits for "Mark paid". */
export async function createOrder(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) go('/admin/orders/new', `Check the form: ${parsed.error.issues[0].path.join('.')} ${parsed.error.issues[0].message}`);
  const v = parsed.data!;
  const user = await db.user.findUnique({ where: { email: v.email } });
  if (!user) go('/admin/orders/new', `No account uses ${v.email}. They need to sign up first.`);

  const coupon = v.coupon ? await db.coupon.findUnique({ where: { code: v.coupon } }) : null;
  if (v.coupon && !coupon) go('/admin/orders/new', `No coupon called ${v.coupon}.`);
  // An amount typed in wins; otherwise the list price, less the coupon.
  const list = PRICE_CENTS[v.plan];
  const priced = applyCoupon(coupon, v.plan, list);
  if (priced.error) go('/admin/orders/new', priced.error);
  const typed = v.amount ? Math.round(Number(v.amount.replace(',', '.')) * 100) : NaN;
  if (v.amount && (!Number.isFinite(typed) || typed < 0)) go('/admin/orders/new', 'The amount must be a number, like 24 or 19.50.');
  const amount = v.amount ? typed : priced.amount;

  const order = await db.order.create({
    data: {
      userId: user!.id,
      email: user!.email,
      provider: 'manual',
      plan: v.plan,
      amount,
      currency: v.currency,
      status: v.status,
      reason: 'manual',
      couponCode: coupon?.code ?? null,
      note: v.note || null,
      createdBy: admin.email,
      paidAt: v.status === 'paid' ? new Date() : null,
    },
  });
  if (v.status === 'paid') {
    await grantPlan(user!.id, v.plan);
    if (coupon) await db.coupon.update({ where: { id: coupon.id }, data: { used: { increment: 1 } } });
  }
  await audit(admin, 'order.create', `Created a ${v.status} ${v.plan} order of ${money(amount, v.currency)} for ${user!.email}`, { type: 'order', id: order.id });
  go(`/admin/orders/${order.id}`, v.status === 'paid' ? 'Order created and Pro granted.' : 'Order created. Mark it paid once the money arrives.');
}

async function manualOrder(form: FormData) {
  const order = await db.order.findUnique({ where: { id: String(form.get('orderId') ?? '') } });
  if (!order) redirect('/admin/orders');
  return order;
}

export async function markPaid(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const o = await manualOrder(form);
  const here = `/admin/orders/${o.id}`;
  if (o.provider !== 'manual') go(here, 'Polar orders are updated by Polar.');
  if (o.status !== 'pending') go(here, `This order is already ${o.status}.`);
  if (!o.userId) go(here, 'The account behind this order no longer exists.');
  await db.order.update({ where: { id: o.id }, data: { status: 'paid', paidAt: new Date() } });
  await grantPlan(o.userId!, o.plan === 'lifetime' ? 'lifetime' : 'yearly');
  if (o.couponCode) await db.coupon.updateMany({ where: { code: o.couponCode }, data: { used: { increment: 1 } } });
  await audit(admin, 'order.mark_paid', `Marked ${o.email}'s ${o.plan} order paid and granted Pro`, { type: 'order', id: o.id });
  go(here, 'Marked paid. Pro granted.');
}

export async function refundOrder(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const o = await manualOrder(form);
  const here = `/admin/orders/${o.id}`;
  if (o.provider !== 'manual') go(here, 'Refund Polar orders in Polar; the webhook updates them here.');
  if (o.status !== 'paid') go(here, 'Only a paid order can be refunded.');
  const takeProBack = form.get('removePro') === 'on';
  await db.order.update({ where: { id: o.id }, data: { status: 'refunded', refundedAmount: o.amount } });
  if (takeProBack && o.userId) {
    if (o.plan === 'lifetime') await db.user.update({ where: { id: o.userId }, data: { lifetime: false } });
    else await removePro(o.userId, { lifetime: false });
  }
  await audit(admin, 'order.refund', `Recorded a refund of ${money(o.amount, o.currency)} to ${o.email}${takeProBack ? ' and removed Pro' : ''}`, {
    type: 'order',
    id: o.id,
  });
  go(here, takeProBack ? 'Refund recorded and Pro removed.' : 'Refund recorded. Pro left as it was.');
}

export async function cancelOrder(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const o = await manualOrder(form);
  const here = `/admin/orders/${o.id}`;
  if (o.provider !== 'manual' || o.status !== 'pending') go(here, 'Only a pending manual order can be canceled.');
  await db.order.update({ where: { id: o.id }, data: { status: 'canceled' } });
  await audit(admin, 'order.cancel', `Canceled ${o.email}'s pending ${o.plan} order`, { type: 'order', id: o.id });
  go(here, 'Order canceled.');
}

export async function saveNote(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const o = await manualOrder(form);
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  await db.order.update({ where: { id: o.id }, data: { note: note || null } });
  await audit(admin, 'order.note', `Edited the note on ${o.email}'s order`, { type: 'order', id: o.id });
  go(`/admin/orders/${o.id}`, 'Note saved.');
}

export async function importFromPolar() {
  const admin = await requireAdmin('super_admin');
  let msg: string;
  try {
    const r = await importPolarOrders();
    msg = `Imported ${r.imported} Polar ${r.imported === 1 ? 'order' : 'orders'}${r.unmatched ? `, ${r.unmatched} without a matching account` : ''}.`;
    await audit(admin, 'order.import', msg);
  } catch (e) {
    msg = `Polar import failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  go('/admin/orders', msg);
}
