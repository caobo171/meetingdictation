'use server';

import { rm } from 'node:fs/promises';
import path from 'node:path';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ROLES, type Role, audit, isEnvAdmin, requireAdmin } from '@/lib/admin';
import { grantPlan, removePro, setManualPro } from '@/lib/billing';
import { db } from '@/lib/db';

const back = (id: string, msg: string): never => {
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?msg=${encodeURIComponent(msg)}`);
};

async function target(form: FormData) {
  const id = String(form.get('userId') ?? '');
  const user = await db.user.findUnique({ where: { id } });
  if (!user) redirect('/admin/users');
  return user;
}

export async function grantPro(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const u = await target(form);
  const plan = form.get('plan') === 'lifetime' ? 'lifetime' : 'yearly';
  await grantPlan(u.id, plan);
  await audit(admin, 'user.grant_pro', `Gave ${u.email} ${plan === 'lifetime' ? 'lifetime Pro' : 'a year of Pro'}`, { type: 'user', id: u.id });
  back(u.id, plan === 'lifetime' ? 'Lifetime Pro granted.' : 'One year of Pro added.');
}

export async function setProUntil(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const u = await target(form);
  const raw = String(form.get('until') ?? '');
  const until = new Date(`${raw}T23:59:59Z`);
  if (!raw || Number.isNaN(until.getTime())) back(u.id, 'Pick a valid date.');
  await setManualPro(u.id, until);
  await audit(admin, 'user.set_pro_until', `Set ${u.email}'s Pro to end on ${raw}`, { type: 'user', id: u.id });
  back(u.id, `Pro now runs until ${raw}.`);
}

export async function revokePro(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const u = await target(form);
  await removePro(u.id);
  await audit(admin, 'user.revoke_pro', `Removed Pro from ${u.email}`, { type: 'user', id: u.id });
  back(u.id, u.subId ? 'Pro removed. The Polar subscription is still running: cancel it in Polar too.' : 'Pro removed.');
}

export async function setRole(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const u = await target(form);
  const role = String(form.get('role')) as Role;
  if (!ROLES.includes(role)) back(u.id, 'Unknown role.');
  if (u.id === admin.id) back(u.id, 'You can’t change your own role.');
  await db.user.update({ where: { id: u.id }, data: { role } });
  await audit(admin, 'user.set_role', `Changed ${u.email}'s role from ${u.role} to ${role}`, { type: 'user', id: u.id });
  back(u.id, isEnvAdmin(u.email) ? `Role saved as ${role}, but ADMIN_EMAILS still makes them a super admin.` : `Role changed to ${role}.`);
}

export async function revokeDevices(form: FormData) {
  const admin = await requireAdmin();
  const u = await target(form);
  const { count } = await db.extToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit(admin, 'user.revoke_devices', `Disconnected ${count} extension ${count === 1 ? 'browser' : 'browsers'} of ${u.email}`, { type: 'user', id: u.id });
  back(u.id, `${count} ${count === 1 ? 'browser' : 'browsers'} disconnected.`);
}

export async function deleteUser(form: FormData) {
  const admin = await requireAdmin('super_admin');
  const u = await target(form);
  if (u.id === admin.id) back(u.id, 'You can’t delete your own account here. Use Settings.');
  if (String(form.get('confirm') ?? '').trim().toLowerCase() !== u.email.toLowerCase()) back(u.id, 'The email you typed doesn’t match.');
  await db.user.delete({ where: { id: u.id } });
  await rm(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? './uploads', u.id), { recursive: true, force: true });
  await audit(admin, 'user.delete', `Deleted the account ${u.email} and its recordings`, { type: 'user', id: u.id });
  revalidatePath('/admin/users');
  redirect(`/admin/users?msg=${encodeURIComponent(`Deleted ${u.email}.`)}`);
}
