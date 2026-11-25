import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { userFromBearer } from '@/lib/extToken';
import { isPro } from '@/lib/polar';

export async function POST(req: Request) {
  const userId = await userFromBearer(req);
  if (!userId) return NextResponse.json({ message: 'Not connected.' }, { status: 401 });
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, lifetime: true, proUntil: true } });
  if (!u) return NextResponse.json({ message: 'Not connected.' }, { status: 401 });
  return NextResponse.json({ user: { email: u.email, name: u.name, plan: isPro(u) ? 'pro' : 'free' } });
}
