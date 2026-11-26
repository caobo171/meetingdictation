import 'server-only';

import type { User } from '@prisma/client';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

/**
 * Two levels, as in WELE's admin:
 *   admin        content (blog, announcements, recordings) and support (users, read only on billing)
 *   super_admin  everything: orders, refunds, Pro grants, coupons, roles, account deletion, audit log
 * The addresses in ADMIN_EMAILS (comma separated) are super admins whatever their role says, so there is always a
 * way in on a fresh database.
 */
export type AdminLevel = 'admin' | 'super_admin';
export const ROLES = ['user', 'admin', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

function envAdmins() {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function adminLevel(u: Pick<User, 'email' | 'role'> | null | undefined): AdminLevel | null {
  if (!u) return null;
  if (envAdmins().includes(u.email.toLowerCase()) || u.role === 'super_admin') return 'super_admin';
  if (u.role === 'admin') return 'admin';
  return null;
}

export const isAdmin = (u: Pick<User, 'email' | 'role'> | null | undefined) => adminLevel(u) !== null;
export const isSuperAdmin = (u: Pick<User, 'email' | 'role'> | null | undefined) => adminLevel(u) === 'super_admin';
export const isEnvAdmin = (email: string) => envAdmins().includes(email.toLowerCase());

/** The signed-in admin at `level` or above; anyone else gets a 404, so the admin doesn't advertise itself. */
export async function requireAdmin(level: AdminLevel = 'admin') {
  const user = await requireUser();
  const have = adminLevel(user);
  if (!have || (level === 'super_admin' && have !== 'super_admin')) notFound();
  return { ...user, level: have };
}

export type Admin = Awaited<ReturnType<typeof requireAdmin>>;

/** Record an admin action. Never throws: a failed log line must not undo the change it describes. */
export async function audit(
  actor: Pick<User, 'id' | 'email'>,
  action: string,
  summary: string,
  target?: { type: string; id: string },
) {
  try {
    await db.adminLog.create({
      data: { actorId: actor.id, actorEmail: actor.email, action, summary, targetType: target?.type, targetId: target?.id },
    });
  } catch (e) {
    console.error('[admin] audit log failed', e);
  }
}
