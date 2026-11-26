import 'server-only';

import type { Coupon, User } from '@prisma/client';

import { db } from '@/lib/db';
import type { Plan } from '@/lib/polar';

/** List prices in cents, matching the Polar products. */
export const PRICE_CENTS: Record<Plan, number> = { yearly: 2400, lifetime: 3900 };
export const ORDER_STATUSES = ['pending', 'paid', 'refunded', 'canceled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const YEAR = 365 * 24 * 3600 * 1000;

export function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(cents / 100);
}

/** Free, Pro (until a date), or Pro for life; plus the Polar subscription state behind it. */
export function planLabel(u: Pick<User, 'lifetime' | 'proUntil' | 'subId' | 'subStatus' | 'subCancelAtEnd'>) {
  if (u.lifetime) return { pro: true, label: 'Lifetime' };
  const live = !!u.proUntil && u.proUntil.getTime() > Date.now();
  if (!live) return { pro: false, label: u.subStatus === 'canceled' ? 'Free (canceled)' : 'Free' };
  if (u.subStatus === 'trialing') return { pro: true, label: 'Trial' };
  if (u.subCancelAtEnd) return { pro: true, label: 'Pro, cancels' };
  if (u.subStatus === 'past_due') return { pro: true, label: 'Pro, past due' };
  return { pro: true, label: u.subId ? 'Pro yearly' : 'Pro (manual)' };
}

/** Give Pro for a plan: lifetime for good, yearly for a year on top of whatever is left. */
export async function grantPlan(userId: string, plan: Plan) {
  if (plan === 'lifetime') return db.user.update({ where: { id: userId }, data: { lifetime: true } });
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { proUntil: true } });
  const until = new Date(Math.max(Date.now(), u.proUntil?.getTime() ?? 0) + YEAR);
  return db.user.update({ where: { id: userId }, data: { proUntil: until, manualProUntil: until } });
}

/** Pro until a date set by hand (shorter or longer); Polar can still extend it, never cut it below this. */
export const setManualPro = (userId: string, until: Date) => db.user.update({ where: { id: userId }, data: { proUntil: until, manualProUntil: until } });

/** Take Pro away now, including any manual grant. A Polar subscription that renews brings it back. */
export const removePro = (userId: string, opts: { lifetime?: boolean } = {}) =>
  db.user.update({ where: { id: userId }, data: { proUntil: new Date(), manualProUntil: null, ...(opts.lifetime === false ? {} : { lifetime: false }) } });

/** The price after a coupon, or why the coupon can't be used. */
export function applyCoupon(c: Coupon | null, plan: Plan, cents: number): { amount: number; error?: string } {
  if (!c) return { amount: cents };
  if (!c.active) return { amount: cents, error: `Coupon ${c.code} is turned off.` };
  if (c.expiresAt && c.expiresAt < new Date()) return { amount: cents, error: `Coupon ${c.code} has expired.` };
  if (c.maxUses != null && c.used >= c.maxUses) return { amount: cents, error: `Coupon ${c.code} is used up.` };
  if (c.plan && c.plan !== plan) return { amount: cents, error: `Coupon ${c.code} is only for the ${c.plan} plan.` };
  const off = c.kind === 'percent' ? Math.round((cents * Math.min(100, c.value)) / 100) : c.value;
  return { amount: Math.max(0, cents - off) };
}

export const couponLabel = (c: Pick<Coupon, 'kind' | 'value'>) => (c.kind === 'percent' ? `${c.value}% off` : `${money(c.value)} off`);
