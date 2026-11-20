import { NextResponse } from 'next/server';

import { progressInput, saveProgress } from '@/lib/progress';
import { currentUserId } from '@/lib/session';

/** Progress from the website's own player (session cookie; also used by sendBeacon on page hide). */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ message: 'Sign in first.' }, { status: 401 });
  const parsed = progressInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.source !== 'web') return NextResponse.json({ message: 'Bad progress.' }, { status: 400 });
  return NextResponse.json(await saveProgress(userId, parsed.data));
}
