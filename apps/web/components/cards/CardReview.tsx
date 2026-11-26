'use client';

import { clozeAnswer, clozeParts, grade, type Grade } from '@md/core';
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { cardRequest, selectionIn, type CardView } from './client';
import { ClipPlayer, type ClipHandle, type ClipMedia } from './ClipPlayer';
import { ExplanationView } from './ExplanationView';

const RATINGS = [
  { value: 1, label: 'Again', className: 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive' },
  { value: 2, label: 'Hard', className: 'border-warning/50 text-warning hover:bg-warning/10 hover:text-warning' },
  { value: 3, label: 'Good', className: 'border-success/50 text-success hover:bg-success/10 hover:text-success' },
  { value: 4, label: 'Easy', className: 'border-primary/40 text-primary hover:bg-primary/10 hover:text-primary' },
] as const;

/** Cards rated into a short learning step come back in the same session. */
const REQUEUE_WITHIN_MS = 20 * 60_000;

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Where the learner can hear the sentence again: the practice page, or the page the extension ran on. */
function sourceLink(c: CardView): { href: string; external: boolean } | null {
  if (c.sourceKey.startsWith('web:')) return { href: `/app/r/${c.sourceKey.slice(4)}`, external: false };
  if (!c.sourceUrl) return null;
  try {
    const u = new URL(c.sourceUrl);
    if (c.start != null && /(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) u.searchParams.set('t', `${Math.floor(c.start)}s`);
    return { href: u.toString(), external: true };
  } catch {
    return null;
  }
}

function Sentence({ card, blanks, focus }: { card: CardView; blanks: boolean; focus?: string | null }) {
  const parts = useMemo(() => clozeParts(card.text, card.missed), [card.text, card.missed]);
  if (blanks) {
    return (
      <p className="text-lg leading-10">
        {parts.map((p, i) =>
          p.blank ? (
            <span key={i} className="mx-0.5 inline-block rounded border-b-2 border-primary bg-primary/5 px-1 align-baseline text-transparent select-none">
              {p.text.replace(/./g, 'x')}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
    );
  }
  // Missed words in amber; the phrase the learner asked about underlined in the primary colour.
  const missedMarks = (text: string, key: string) =>
    clozeParts(text, card.missed).map((p, i) =>
      p.blank ? (
        <mark key={`${key}${i}`} className="rounded bg-warning/20 px-0.5 font-medium text-foreground">{p.text}</mark>
      ) : (
        <span key={`${key}${i}`}>{p.text}</span>
      ),
    );
  const at = focus ? card.text.toLowerCase().indexOf(focus.toLowerCase()) : -1;
  if (focus && at >= 0) {
    return (
      <p className="text-lg leading-9">
        {missedMarks(card.text.slice(0, at), 'a')}
        <span className="rounded bg-primary/10 underline decoration-primary decoration-2 underline-offset-4">
          {missedMarks(card.text.slice(at, at + focus.length), 'f')}
        </span>
        {missedMarks(card.text.slice(at + focus.length), 'b')}
      </p>
    );
  }
  return <p className="text-lg leading-9">{missedMarks(card.text, 'm')}</p>;
}

function AnswerCheck({ g }: { g: Grade }) {
  return (
    <p className="text-sm">
      {g.words.map((w, i) => (
        <span key={i}>
          {w.wrongBefore.map((x, k) => (
            <span key={k} className="mr-1 text-destructive line-through opacity-80">{x}</span>
          ))}
          <span className={cn('mr-1', w.state === 'correct' ? 'text-success' : 'font-medium text-destructive underline decoration-dotted')}>{w.raw}</span>
        </span>
      ))}
      {g.trailingWrong.map((x, i) => (
        <span key={`t${i}`} className="mr-1 text-destructive line-through opacity-80">{x}</span>
      ))}
    </p>
  );
}

export function CardReview({ initial, media }: { initial: CardView[]; media: Record<string, ClipMedia> }) {
  const [queue, setQueue] = useState(initial);
  const [back, setBack] = useState(false);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(0);
  const [selected, setSelected] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const clip = useRef<ClipHandle>(null);
  const sentenceRef = useRef<HTMLDivElement>(null);

  const card = queue[0];
  const cloze = !!card && card.missed.length > 0;
  const answer = card ? clozeAnswer(card.text, card.missed) : '';
  const clipMedia = card && card.start != null && card.end != null ? media[card.sourceKey] : undefined;

  useEffect(() => {
    setBack(false);
    setTyped('');
    setChecked(null);
    setError('');
    if (card) requestAnimationFrame(() => inputRef.current?.focus());
  }, [card?.id, reviewed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onSelect = () => setSelected(selectionIn(sentenceRef.current));
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  const reveal = useCallback(() => {
    if (!card || back) return;
    if (cloze && typed.trim()) setChecked(grade(answer, typed));
    setBack(true);
  }, [card, back, cloze, typed, answer]);

  const rate = useCallback(
    async (rating: number) => {
      if (!card || !back || busy) return;
      setBusy(true);
      setError('');
      try {
        const next = await cardRequest({ action: 'rate', id: card.id, rating });
        setQueue((q) => {
          const rest = q.slice(1);
          return next && new Date(next.due).getTime() - Date.now() < REQUEUE_WITHIN_MS ? [...rest, next] : rest;
        });
        setReviewed((n) => n + 1);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [card, back, busy],
  );

  const explain = async () => {
    if (!card || explaining) return;
    setExplaining(true);
    setError('');
    try {
      const next = await cardRequest({ action: 'explain', id: card.id, focus: selected || null, force: !selected && !!card.explanation });
      if (next) setQueue((q) => [{ ...next, intervals: q[0].intervals }, ...q.slice(1)]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExplaining(false);
    }
  };

  const remove = async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await cardRequest({ action: 'delete', id: card.id });
      setQueue((q) => q.slice(1));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (!back) {
        if (e.key === 'Enter' || (e.key === ' ' && !inField)) {
          e.preventDefault();
          reveal();
        } else if (e.key === '1' && clipMedia) {
          e.preventDefault();
          clip.current?.toggle();
        }
        return;
      }
      if (inField) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void rate(checked?.passed ? 3 : 1);
      } else if (e.key === 'p' && clipMedia) clip.current?.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, reveal, rate, checked, clipMedia]);

  if (!card) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <CheckCircleIcon className="size-10 text-success" />
        <h2 className="text-lg font-semibold">{reviewed ? 'All caught up' : 'Nothing due right now'}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {reviewed
            ? `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}. The next ones come back when they are due.`
            : 'Sentences you miss while practising, and the ones you ask the AI to explain, come back here when it is time to review them.'}
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/app/recordings">Practise a recording</Link>
        </Button>
      </Card>
    );
  }

  const link = sourceLink(card);
  const recommended = checked ? (checked.passed ? 3 : 1) : null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {link ? (
            <a href={link.href} target={link.external ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              {card.sourceTitle}
              {link.external && <ArrowTopRightOnSquareIcon className="size-3.5" />}
            </a>
          ) : (
            card.sourceTitle
          )}
          {card.start != null && ` · ${fmt(card.start)}`}
          {card.speaker && ` · ${card.speaker}`}
        </span>
        <span className="tabular-nums">{queue.length} left</span>
      </div>

      {card.before && <p className="mt-5 text-sm text-muted-foreground">{card.before}</p>}
      <div ref={sentenceRef} className="mt-2">
        <Sentence card={card} blanks={cloze && !back} focus={card.focus} />
      </div>
      {back && card.after && <p className="mt-2 text-sm text-muted-foreground">{card.after}</p>}

      {clipMedia && (
        <div className="mt-4">
          <ClipPlayer ref={clip} media={clipMedia} start={card.start!} end={card.end!} autoPlay={!back} key={card.id} />
        </div>
      )}

      {!back ? (
        <div className="mt-5 space-y-3">
          {cloze ? (
            <>
              <Input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={`Type the missing word${card.missed.length === 1 ? '' : 's'}${clipMedia ? ' (1 = listen)' : ''}, then Enter`}
                autoComplete="off"
                spellCheck={false}
                className="text-base"
              />
              <Button onClick={reveal}>{typed.trim() ? 'Check' : 'Show answer'}</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{card.focus ? `What does “${card.focus}” mean here?` : 'Do you remember what this means here?'}</p>
              <Button onClick={reveal}>Show meaning <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 font-mono text-[10px]">Space</kbd></Button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {cloze && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Missing: </span>
              <span className="font-medium">{answer}</span>
              {checked && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-muted-foreground">You typed:</span>
                  <AnswerCheck g={grade(answer, typed)} />
                </div>
              )}
            </div>
          )}

          {card.explanation ? (
            <div className="rounded-lg border p-4">
              <div className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <SparklesIcon className="size-3.5" /> In this meeting
              </div>
              <ExplanationView e={card.explanation} focus={card.focus} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => void explain()} disabled={explaining} className="max-w-full">
              <SparklesIcon className="text-primary" />
              <span className="truncate">
                {explaining ? 'Explaining…' : selected ? `Explain “${selected}”` : card.explanation ? 'Explain again' : 'Explain with AI'}
              </span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy} className="text-muted-foreground">
              <TrashIcon /> Remove card
            </Button>
          </div>
          {!card.explanation && !explaining && <p className="text-xs text-muted-foreground">Select a phrase in the sentence to ask about just that.</p>}

          <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4">
            {RATINGS.map((r) => (
              <Button
                key={r.value}
                variant="outline"
                onClick={() => void rate(r.value)}
                disabled={busy}
                className={cn('h-auto flex-col gap-0 py-2.5', r.className, recommended === r.value && 'ring-2 ring-ring ring-offset-1')}
              >
                <span className="font-semibold">{r.label}</span>
                <span className="text-xs opacity-80">
                  {r.value === 1 ? '< ' : ''}
                  {card.intervals[r.value]}
                  <kbd className="ml-1.5 font-mono opacity-70">{r.value}</kbd>
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
