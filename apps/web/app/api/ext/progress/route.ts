import { NextResponse } from 'next/server';
import { z } from 'zod';

import { userFromBearer } from '@/lib/extToken';
import { loadProgress, progressInput, saveProgress } from '@/lib/progress';

/**
 * The extension's sync. Bearer token from /extension/connect.
 *   { action: "get", key }          → saved progress or null
 *   { action: "put", ...progress }  → merged progress
 */
export async function POST(req: Request) {
  const userId = await userFromBearer(req);
  if (!userId) return NextResponse.json({ message: 'Not connected.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.action === 'get') {
    const key = z.string().min(1).max(500).safeParse(body.key);
    if (!key.success) return NextResponse.json({ message: 'Bad key.' }, { status: 400 });
    return NextResponse.json({ progress: await loadProgress(userId, key.data) });
  }
  if (body?.action === 'put') {
    const parsed = progressInput.safeParse({ ...body, source: 'extension' });
    if (!parsed.success) return NextResponse.json({ message: 'Bad progress.' }, { status: 400 });
    return NextResponse.json({ progress: await saveProgress(userId, parsed.data) });
  }
  return NextResponse.json({ message: 'Unknown action.' }, { status: 400 });
}
