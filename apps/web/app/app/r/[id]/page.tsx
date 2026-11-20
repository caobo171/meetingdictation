import type { Cue } from '@md/core';
import { notFound } from 'next/navigation';

import { Dictation } from '@/components/dictation/Dictation';
import { db } from '@/lib/db';
import { loadProgress } from '@/lib/progress';
import { requireUser } from '@/lib/session';
import { youTubeId } from '@/lib/youtube';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const rec = await db.recording.findUnique({ where: { id: params.id }, select: { title: true } });
  return { title: rec?.title ?? 'Practice' };
}

export default async function PracticePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const rec = await db.recording.findFirst({ where: { id: params.id, userId: user.id } });
  if (!rec) notFound();
  const progress = await loadProgress(user.id, `web:${rec.id}`);

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
    />
  );
}
