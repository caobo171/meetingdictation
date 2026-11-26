import type { Cue } from '@md/core';
import { notFound } from 'next/navigation';

import type { Explanation } from '@/components/cards/client';
import { Dictation, type CardInfo } from '@/components/dictation/Dictation';
import { db } from '@/lib/db';
import { loadProgress } from '@/lib/progress';
import { requireUser } from '@/lib/session';
import { youTubeId } from '@/lib/youtube';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await db.recording.findUnique({ where: { id }, select: { title: true } });
  return { title: rec?.title ?? 'Practice' };
}

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const rec = await db.recording.findFirst({ where: { id, userId: user.id } });
  if (!rec) notFound();
  const progress = await loadProgress(user.id, `web:${rec.id}`);
  const cardRows = await db.card.findMany({
    where: { userId: user.id, sourceKey: `web:${rec.id}` },
    select: { id: true, segIndex: true, focus: true, explanation: true },
  });
  const cards: Record<number, CardInfo> = Object.fromEntries(
    cardRows.map((c) => [c.segIndex, { id: c.id, focus: c.focus, explanation: c.explanation ? (JSON.parse(c.explanation) as Explanation) : null }]),
  );

  return (
    <Dictation
      recording={{
        id: rec.id,
        title: rec.title,
        sourceType: rec.sourceType as 'upload' | 'youtube',
        youtubeId: rec.sourceUrl ? youTubeId(rec.sourceUrl) : null,
        mediaUrl: rec.mediaPath ? `/api/media/${rec.id}` : null,
        mediaType: rec.mediaType,
        cues: JSON.parse(rec.cues) as Cue[],
      }}
      initial={progress ? { fp: progress.fp, index: progress.index, results: progress.results } : null}
      cards={cards}
    />
  );
}
