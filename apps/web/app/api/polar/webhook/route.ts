import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { applyEvent, verifyWebhook } from '@/lib/polar';

export const runtime = 'nodejs';

/** Polar webhook: subscription.* for the yearly plan, order.paid / order.refunded for lifetime. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyWebhook(req.headers, body)) return NextResponse.json({ message: 'Bad signature.' }, { status: 401 });
  const id = req.headers.get('webhook-id')!;
  const event = JSON.parse(body) as { type: string; data: unknown };

  if (await db.polarEvent.findUnique({ where: { id } })) return NextResponse.json({ ok: true, replay: true });
  const known = await applyEvent(event.type, event.data);
  if (!known) {
    // Nobody to give it to yet: a 5xx makes Polar retry, by which time the account may exist.
    console.warn(`[polar] ${event.type} ${id}: no matching user`);
    return NextResponse.json({ message: 'Unknown customer.' }, { status: 500 });
  }
  try {
    await db.polarEvent.create({ data: { id, type: event.type } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  return NextResponse.json({ ok: true });
}
