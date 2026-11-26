import { NextResponse } from 'next/server';

import { handleCardRequest } from '@/lib/cards';
import { currentUserId } from '@/lib/session';

/** Flashcards from the website's own player and review page (session cookie). See handleCardRequest. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ message: 'Sign in first.' }, { status: 401 });
  return handleCardRequest(userId, await req.json().catch(() => null), req.headers.get('accept-language'));
}
