'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { issueExtToken } from '@/lib/extToken';
import { requireUser } from '@/lib/session';

/** Called by /extension/connect only after the extension answered the page's ping. */
export async function createExtensionToken(browser: string) {
  const user = await requireUser();
  const token = await issueExtToken(user.id, `${browser.slice(0, 40)} · ${new Date().toISOString().slice(0, 10)}`);
  return { token, email: user.email, name: user.name };
}

export async function revokeExtensionToken(id: string) {
  const user = await requireUser();
  await db.extToken.updateMany({ where: { id, userId: user.id }, data: { revokedAt: new Date() } });
  revalidatePath('/app/extension');
  revalidatePath('/app/settings');
}
