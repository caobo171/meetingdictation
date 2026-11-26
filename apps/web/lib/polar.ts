import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { User } from '@prisma/client';

import { db } from '@/lib/db';

/**
 * Billing through Polar (polar.sh). Two products, created once in the Polar dashboard / API:
 *   POLAR_PRODUCT_YEARLY   $24 a year ($2 a month), 7-day trial
 *   POLAR_PRODUCT_LIFETIME $39 once
 * Polar knows our user by `external_customer_id` = User.id, so every webhook maps back to one row.
 */

const API = process.env.POLAR_API_URL ?? 'https://api.polar.sh';

export type Plan = 'yearly' | 'lifetime';

export const PLANS: Record<Plan, { name: string; price: string; per: string; note: string }> = {
  yearly: { name: 'Pro yearly', price: '$2', per: '/month', note: 'Billed $24 once a year. 7 days free first.' },
  lifetime: { name: 'Pro lifetime', price: '$39', per: 'once', note: 'Pay once, keep Pro forever.' },
};

/** Recordings a free account can keep on the website. The extension stays free. */
export const FREE_RECORDINGS = 3;

export function productId(plan: Plan): string {
  const id = plan === 'yearly' ? process.env.POLAR_PRODUCT_YEARLY : process.env.POLAR_PRODUCT_LIFETIME;
  if (!id) throw new Error(`POLAR_PRODUCT_${plan.toUpperCase()} is not set`);
  return id;
}

export function isPro(u: Pick<User, 'lifetime' | 'proUntil'>): boolean {
  return u.lifetime || (!!u.proUntil && u.proUntil.getTime() > Date.now());
}

async function polar<T>(path: string, body: unknown): Promise<T> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set');
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Polar ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

const origin = () => (process.env.AUTH_URL ?? 'http://localhost:4100').replace(/\/$/, '');

/** A Polar checkout for this learner; returns the URL to send them to. */
export async function createCheckout(user: Pick<User, 'id' | 'email' | 'name'>, plan: Plan): Promise<string> {
  const body = {
    products: [productId(plan)],
    external_customer_id: user.id,
    customer_email: user.email,
    customer_name: user.name ?? undefined,
    success_url: `${origin()}/app/billing?paid=1`,
    metadata: { userId: user.id, plan },
  };
  try {
    return (await polar<{ url: string }>('/v1/checkouts/', body)).url;
  } catch (e) {
    // Polar refuses some addresses we accept (e.g. reserved domains): let the learner type one at checkout.
    if (!/customer_email/.test(String(e))) throw e;
    return (await polar<{ url: string }>('/v1/checkouts/', { ...body, customer_email: undefined })).url;
  }
}

/** Polar's customer portal (invoices, card, cancel), signed in as this learner. */
export async function customerPortalUrl(userId: string): Promise<string> {
  const s = await polar<{ customer_portal_url: string }>('/v1/customer-sessions/', { external_customer_id: userId });
  return s.customer_portal_url;
}

// ------------------------------------------------------------------ webhooks

/**
 * Standard Webhooks: base64 HMAC-SHA256 over `{id}.{timestamp}.{body}`. Polar's own SDK keys the HMAC with
 * the secret's raw UTF-8 bytes, prefix and all; the Standard Webhooks reading of a `whsec_` secret is the
 * base64 after the prefix. Either key is accepted. Any one `v1,` entry may match. 5-minute window.
 */
export function verifyWebhook(headers: Headers, body: string, secret = process.env.POLAR_WEBHOOK_SECRET ?? ''): boolean {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigs = headers.get('webhook-signature');
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const keys = [Buffer.from(secret, 'utf8')];
  if (secret.startsWith('whsec_')) keys.push(Buffer.from(secret.slice(6), 'base64'));
  const wants = keys.map((k) => createHmac('sha256', k).update(`${id}.${ts}.${body}`).digest());
  return sigs.split(' ').some((entry) => {
    const [v, sig] = entry.split(',');
    if (v !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return wants.some((want) => got.length === want.length && timingSafeEqual(got, want));
  });
}

type Customer = { id: string; external_id?: string | null };
type Subscription = {
  id: string;
  status: string;
  product_id: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  ended_at?: string | null;
  customer: Customer;
  metadata?: Record<string, unknown>;
};
type Order = {
  id: string;
  product_id: string;
  status?: string;
  customer: Customer & { email?: string | null };
  metadata?: Record<string, unknown>;
  total_amount?: number;
  refunded_amount?: number;
  currency?: string;
  billing_reason?: string;
  created_at?: string;
  discount?: { code?: string | null } | null;
};

/** Keep a copy of every Polar order for our products, for the admin's orders, customers and revenue. */
async function recordOrder(o: Order, u: User | null) {
  const plan = o.product_id === process.env.POLAR_PRODUCT_LIFETIME ? 'lifetime' : 'yearly';
  const status = o.status === 'refunded' ? 'refunded' : o.status === 'pending' ? 'pending' : 'paid';
  const data = {
    userId: u?.id ?? null,
    email: u?.email ?? o.customer.email ?? '',
    plan,
    amount: o.total_amount ?? 0,
    refundedAmount: o.refunded_amount ?? 0,
    currency: (o.currency ?? 'usd').toLowerCase(),
    status,
    reason: o.billing_reason ?? null,
    couponCode: o.discount?.code ?? null,
    paidAt: status === 'pending' ? null : new Date(o.created_at ?? Date.now()),
  };
  await db.order.upsert({
    where: { providerId: o.id },
    update: data,
    create: { ...data, provider: 'polar', providerId: o.id, createdAt: o.created_at ? new Date(o.created_at) : undefined },
  });
}

async function userFor(c: Customer, metadata?: Record<string, unknown>): Promise<User | null> {
  const id = c.external_id ?? (typeof metadata?.userId === 'string' ? metadata.userId : null);
  if (id) {
    const u = await db.user.findUnique({ where: { id } });
    if (u) return u;
  }
  return db.user.findFirst({ where: { polarCustomerId: c.id } });
}

const DAY = 24 * 3600 * 1000;

/** Apply one verified Polar event. Returns false when it names nobody we know. */
export async function applyEvent(type: string, data: unknown): Promise<boolean> {
  if (type.startsWith('subscription.')) {
    const s = data as Subscription;
    if (s.product_id !== process.env.POLAR_PRODUCT_YEARLY) return true;
    const u = await userFor(s.customer, s.metadata);
    if (!u) return false;
    // Pro runs to the end of the paid (or trial) period, with a day's grace for a late renewal.
    const live = ['trialing', 'active', 'past_due'].includes(s.status) || (s.status === 'canceled' && !s.ended_at);
    const end = s.current_period_end ? new Date(new Date(s.current_period_end).getTime() + DAY) : null;
    const subUntil = live ? end : new Date(s.ended_at ?? Date.now());
    // Pro granted in the admin outlasts whatever Polar says.
    const manual = u.manualProUntil && u.manualProUntil.getTime() > Date.now() ? u.manualProUntil : null;
    const proUntil = manual && (!subUntil || manual > subUntil) ? manual : subUntil;
    await db.user.update({
      where: { id: u.id },
      data: {
        polarCustomerId: s.customer.id,
        subId: s.id,
        subStatus: s.status,
        subCancelAtEnd: !!s.cancel_at_period_end,
        proUntil,
      },
    });
    return true;
  }
  if (type === 'order.paid' || type === 'order.refunded' || type === 'order.updated') {
    const o = data as Order;
    const ours = [process.env.POLAR_PRODUCT_LIFETIME, process.env.POLAR_PRODUCT_YEARLY].includes(o.product_id);
    if (!ours) return true;
    const u = await userFor(o.customer, o.metadata);
    if (!u) return false;
    await recordOrder(o, u);
    if (o.product_id !== process.env.POLAR_PRODUCT_LIFETIME || type === 'order.updated') return true;
    // A partial refund keeps lifetime; only a full refund takes it back.
    const refunded = o.status === 'refunded';
    await db.user.update({ where: { id: u.id }, data: { polarCustomerId: o.customer.id, lifetime: !refunded } });
    return true;
  }
  return true;
}

/** Every order Polar has for our products, newest first, for a one-off import into the admin. */
export async function importPolarOrders(maxPages = 20): Promise<{ imported: number; unmatched: number }> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set');
  let imported = 0;
  let unmatched = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${API}/v1/orders/?limit=100&page=${page}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) throw new Error(`Polar /v1/orders ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { items: Order[]; pagination?: { max_page?: number } };
    for (const o of body.items) {
      if (![process.env.POLAR_PRODUCT_LIFETIME, process.env.POLAR_PRODUCT_YEARLY].includes(o.product_id)) continue;
      const u = await userFor(o.customer, o.metadata);
      if (!u) unmatched++;
      await recordOrder(o, u);
      imported++;
    }
    if (!body.pagination?.max_page || page >= body.pagination.max_page) break;
  }
  return { imported, unmatched };
}
