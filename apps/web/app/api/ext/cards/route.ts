import { NextResponse } from 'next/server';

import { handleCardRequest } from '@/lib/cards';
import { userFromBearer } from '@/lib/extToken';

/**
 * Flashcards from the extension: missed sentences and AI explanations. Bearer
 * token from /extension/connect; the body carries the panel's language, since
 * the request comes from the background worker. See handleCardRequest.
 */
export async function POST(req: Request) {
  const userId = await userFromBearer(req);
  if (!userId) return NextResponse.json({ message: 'Not connected.' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lang?: unknown } | null;
  return handleCardRequest(userId, body, typeof body?.lang === 'string' ? body.lang : req.headers.get('accept-language'));
}
