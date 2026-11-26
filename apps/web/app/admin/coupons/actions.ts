'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit, requireAdmin } from '@/lib/admin';
import { couponLabel } from '@/lib/billing';
import { db } from '@/lib/db';

const go = (msg: string): never => {
  revalidatePath('/admin/coupons');
  redirect(`/admin/coupons?msg=${encodeURIComponent(msg)}`);
};

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, '3-32 letters, digits, - or _'),
  name: z.string().trim().max(80),
  kind: z.enum(['percent', 'amount']),
  value: z.coerce.number().positive(),
  plan: z.enum(['', 'yearly', 'lifetime']),
  maxUses: z.string().trim(),
  expiresAt: z.string().trim(),
});

export async function createCoupon(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) go(`Check the coupon: ${p.error.issues[0].path.join('.')} ${p.error.issues[0].message}`);
  const v = p.data!;
  if (v.kind === 'percent' && v.value > 100) go('A percentage can’t be over 100.');
  if (await db.coupon.findUnique({ where: { code: v.code } })) go(`${v.code} already exists.`);
  const maxUses = v.maxUses ? Number.parseInt(v.maxUses, 10) : null;
  if (v.maxUses && (!Number.isFinite(maxUses) || maxUses! < 1)) go('Max uses must be a whole number, 1 or more.');
  const c = await db.coupon.create({
    data: {
      code: v.code,
      name: v.name || null,
      kind: v.kind,
      // Amounts are typed in dollars and stored in cents.
      value: v.kind === 'amount' ? Math.round(v.value * 100) : Math.round(v.value),
      plan: v.plan || null,
      maxUses,
      expiresAt: v.expiresAt ? new Date(`${v.expiresAt}T23:59:59Z`) : null,
    },
  });
  await audit(admin, 'coupon.create', `Created coupon ${c.code} (${couponLabel(c)})`, { type: 'coupon', id: c.id });
  go(`Coupon ${c.code} created.`);
}

export async function toggleCoupon(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const c = await db.coupon.findUnique({ where: { id: String(form.get('id')) } });
  if (!c) go('That coupon is gone.');
  await db.coupon.update({ where: { id: c!.id }, data: { active: !c!.active } });
  await audit(admin, 'coupon.toggle', `Turned coupon ${c!.code} ${c!.active ? 'off' : 'on'}`, { type: 'coupon', id: c!.id });
  go(`${c!.code} turned ${c!.active ? 'off' : 'on'}.`);
}

export async function deleteCoupon(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const c = await db.coupon.findUnique({ where: { id: String(form.get('id')) } });
  if (!c) go('That coupon is gone.');
  if (c!.used > 0) go(`${c!.code} has been used; turn it off instead, so its orders still make sense.`);
  await db.coupon.delete({ where: { id: c!.id } });
  await audit(admin, 'coupon.delete', `Deleted coupon ${c!.code}`, { type: 'coupon', id: c!.id });
  go(`${c!.code} deleted.`);
}
