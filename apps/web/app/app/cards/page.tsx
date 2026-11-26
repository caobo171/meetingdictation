import { clozeParts } from '@md/core';

import { CardReview } from '@/components/cards/CardReview';
import type { ClipMedia } from '@/components/cards/ClipPlayer';
import { DeleteCardButton } from '@/components/cards/DeleteCardButton';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dueCards, formatInterval } from '@/lib/cards';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { youTubeId } from '@/lib/youtube';

export const metadata = { title: 'Flashcards' };

export default async function FlashcardsPage() {
  const user = await requireUser();
  const { due, dueCount, total } = await dueCards(user.id);

  // Sentences from recordings kept on the website can be played again on the card.
  const recIds = [...new Set(due.filter((c) => c.sourceKey.startsWith('web:')).map((c) => c.sourceKey.slice(4)))];
  const recs = recIds.length
    ? await db.recording.findMany({
        where: { id: { in: recIds }, userId: user.id },
        select: { id: true, sourceType: true, sourceUrl: true, mediaPath: true, mediaType: true },
      })
    : [];
  const media: Record<string, ClipMedia> = Object.fromEntries(
    recs.map((r) => [
      `web:${r.id}`,
      {
        sourceType: r.sourceType as 'upload' | 'youtube',
        youtubeId: r.sourceUrl ? youTubeId(r.sourceUrl) : null,
        mediaUrl: r.mediaPath ? `/api/media/${r.id}` : null,
        mediaType: r.mediaType,
      },
    ]),
  );

  const all = await db.card.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, text: true, missed: true, focus: true, explanation: true, sourceTitle: true, due: true, reps: true },
  });
  const now = Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Flashcards"
        description={
          total
            ? `${dueCount} due now · ${total} card${total === 1 ? '' : 's'} in all. Each one is a sentence you missed or asked about, kept in its meeting.`
            : 'Sentences you miss while practising, and the ones you ask the AI to explain, become cards here.'
        }
      />

      <CardReview initial={due} media={media} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><span className="kbd">Enter</span> check · show</span>
        <span><span className="kbd">1</span> listen</span>
        <span><span className="kbd">1</span>–<span className="kbd">4</span> Again · Hard · Good · Easy</span>
        <span>Select a phrase, then Explain, to ask about it</span>
      </div>

      {all.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All cards</CardTitle>
            <CardDescription>Newest first{total > all.length ? `, the latest ${all.length}` : ''}. Missed words are highlighted.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {all.map((c) => {
                const parts = clozeParts(c.text, JSON.parse(c.missed) as string[]);
                const wait = c.due.getTime() - now;
                return (
                  <li key={c.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {parts.map((p, i) =>
                          p.blank ? (
                            <mark key={i} className="rounded bg-warning/20 px-0.5 font-medium text-foreground">{p.text}</mark>
                          ) : (
                            <span key={i}>{p.text}</span>
                          ),
                        )}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {c.sourceTitle}
                        {c.focus && ` · asked about “${c.focus}”`}
                        {c.explanation && ' · explained'}
                        {' · '}
                        {wait <= 0 ? 'due now' : `next in ${formatInterval(wait)}`}
                      </p>
                    </div>
                    <DeleteCardButton id={c.id} />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
