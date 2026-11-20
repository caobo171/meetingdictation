import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { userFromBearer } from '@/lib/extToken';

export async function POST(req: Request) {
  const userId = await userFromBearer(req);
  if (!userId) return NextResponse.json({ message: 'Not connected.' }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  return NextResponse.json({ user });
}
