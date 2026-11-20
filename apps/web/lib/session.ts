import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { db } from '@/lib/db';

/** The signed-in user, or a redirect to /login. */
export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/login');
  const user = await db.user.findUnique({ where: { id } });
  if (!user) redirect('/login');
  return user;
}

export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
