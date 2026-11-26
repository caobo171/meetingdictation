'use client';

import {
  blankParts,
  buildSegments,
  grade,
  hasWords,
  hint,
  isDone,
  missedWords,
  transcriptFingerprint,
  type Cue,
  type Grade,
  type Result,
  type Results,
  type Segment,
} from '@md/core';
import {
  ArrowPathRoundedSquareIcon,
  BackwardIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ForwardIcon,
  MusicalNoteIcon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cardRequest, selectionIn, type CardView, type Explanation } from '@/components/cards/client';
import { ExplanationView } from '@/components/cards/ExplanationView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { htmlMediaPort, youTubePort, type MediaPort } from './media';


export interface DictationProps {
  recording: {
    id: string;
    title: string;
    sourceType: 'upload' | 'youtube';
    youtubeId?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    cues: Cue[];
  };
  initial: { fp: string; index: number; results: Results } | null;
  /** Flashcards already kept for this recording, by sentence index. */
  cards?: Record<number, CardInfo>;
}

export interface CardInfo {
  id: string;
  focus: string | null;
  explanation: Explanation | null;
}

const cardInfo = (c: CardView): CardInfo => ({ id: c.id, focus: c.focus, explanation: c.explanation });

const PAD_BEFORE = 0.15;
const PAD_AFTER = 0.35;
const NUDGE = 2;
const RATES = [0.5, 0.75, 1, 1.25];


function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * The word that opens the sentence, typed in for the learner (WELE's full dictation shows each
 * sentence's first word instead of asking for it). Empty when the line has one word to write.
 */
function openerOf(text: string): string {
  const first = blankParts(text).find((p) => p.word && !(p.filler && !p.given));
  return first?.given ? `${first.word} ` : '';
}

function localDay(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function GradeView({ g, revealed }: { g: Grade; revealed: boolean }) {
  return (
    <p className="text-[16px] leading-9">
      {g.words.map((w, i) => (
        <span key={i}>
          {w.wrongBefore.map((x, k) => (
            <span key={k} className="mr-1 text-bad line-through opacity-80">
              {x}
            </span>
          ))}
          {w.state === 'correct' ? (
            <span className="text-good">{w.raw}</span>
          ) : w.state === 'filler' ? (
            <span className="italic text-ink-3/70">{w.raw}</span>
          ) : revealed ? (
            <span className="font-semibold text-bad underline decoration-dotted">{w.raw}</span>
          ) : (
            <span className={`tracking-widest ${w.state === 'partial' ? 'text-bad' : 'text-ink-3'}`}>
              {w.raw.replace(/[\p{L}\p{N}]/gu, '*')}
            </span>
          )}{' '}
        </span>
      ))}
      {g.trailingWrong.map((x, k) => (
        <span key={`t${k}`} className="mr-1 text-bad line-through opacity-80">
          {x}
        </span>
      ))}
    </p>
  );
}

export function Dictation({ recording, initial, cards: initialCards }: DictationProps) {
  const segments: Segment[] = useMemo(
    () => buildSegments(recording.cues).filter((s) => hasWords(s.text)),
    [recording.cues],
  );
  const fp = transcriptFingerprint(segments);
  const fresh = !initial || initial.fp !== fp;

  const [index, setIndex] = useState(fresh ? 0 : Math.min(initial!.index, segments.length - 1));
  const [results, setResults] = useState<Results>(fresh ? {} : initial!.results);
  const [typed, setTyped] = useState('');
  const [graded, setGraded] = useState<{ g: Grade; revealed: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [note, setNote] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [cards, setCards] = useState<Record<number, CardInfo>>(initialCards ?? {});
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState('');
  const [selected, setSelected] = useState('');
  const sentenceRef = useRef<HTMLDivElement>(null);

  const portRef = useRef<MediaPort | null>(null);
  const videoRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stopAt = useRef<number | null>(null);
  const raf = useRef(0);
  const loopTimer = useRef<number>(0);
  const played = useRef(0);
  const lastTick = useRef(0);
  const dirty = useRef(false);
  const state = useRef({ index, results, loop, rate });
  state.current = { index, results, loop, rate };

  const seg = segments[index];

  // ------------------------------------------------------------ player
  useEffect(() => {
    if (recording.sourceType === 'upload' && videoRef.current) {
      portRef.current = htmlMediaPort(videoRef.current);
      return undefined;
    }
    let destroy: (() => void) | undefined;
    let cancelled = false;
    if (recording.sourceType === 'youtube' && recording.youtubeId && ytRef.current) {
      const host = document.createElement('div');
      ytRef.current.appendChild(host);
      void youTubePort(host, recording.youtubeId).then((r) => {
        if (cancelled) return r.destroy();
        portRef.current = r.port;
        destroy = r.destroy;
      });
    }
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [recording.sourceType, recording.youtubeId]);

  const setPlayingUi = (v: boolean) => setPlaying(v);

  const watch = useCallback(() => {
    cancelAnimationFrame(raf.current);
    lastTick.current = performance.now();
    const tick = () => {
      const port = portRef.current;
      if (!port || stopAt.current === null) return;
      const now = performance.now();
      if (!port.paused()) played.current += Math.min(1, (now - lastTick.current) / 1000);
      lastTick.current = now;
      if (port.time() >= stopAt.current) {
        port.pause();
        setPlayingUi(false);
        if (state.current.loop) {
          window.clearTimeout(loopTimer.current);
          loopTimer.current = window.setTimeout(() => playSegmentRef.current(true), 700);
        } else stopAt.current = null;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const playSegment = useCallback(
    (fromStart: boolean) => {
      const port = portRef.current;
      const s = segments[state.current.index];
      if (!port || !s) {
        setNote('The player is still loading…');
        return;
      }
      const stop = s.end + PAD_AFTER;
      const t = port.time();
      if (fromStart || t < s.start - PAD_BEFORE - 0.05 || t >= stop - 0.05) port.seek(Math.max(0, s.start - PAD_BEFORE));
      port.setRate(state.current.rate);
      stopAt.current = stop;
      port.play();
      setNote('');
      setPlayingUi(true);
      watch();
    },
    [segments, watch],
  );
  const playSegmentRef = useRef(playSegment);
  playSegmentRef.current = playSegment;

  const pauseSegment = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(loopTimer.current);
    portRef.current?.pause();
    setPlayingUi(false);
  }, []);

  const togglePlay = useCallback(() => {
    const port = portRef.current;
    if (port && !port.paused() && stopAt.current !== null) pauseSegment();
    else playSegment(false);
  }, [pauseSegment, playSegment]);

  const nudge = (d: number) => {
    const port = portRef.current;
    if (!port || !seg) return;
    port.seek(Math.min(Math.max(seg.start - PAD_BEFORE, port.time() + d), seg.end));
    if (port.paused()) playSegment(false);
  };

  // ------------------------------------------------------------ navigation
  const goTo = useCallback(
    (i: number, autoplay: boolean) => {
      pauseSegment();
      const next = Math.max(0, Math.min(i, segments.length - 1));
      setIndex(next);
      state.current.index = next;
      const r = state.current.results[next];
      setTyped(r?.typed ?? openerOf(segments[next].text));
      setGraded(r ? { g: grade(segments[next].text, r.typed), revealed: r.revealed } : null);
      setExplainError('');
      dirty.current = true;
      if (autoplay) window.setTimeout(() => playSegmentRef.current(true), 60);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    },
    [pauseSegment, segments],
  );

  useEffect(() => {
    goTo(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [index]);

  const record = (r: Result) => {
    setResults((prev) => {
      const next = { ...prev, [index]: r };
      state.current.results = next;
      return next;
    });
    dirty.current = true;
  };

  // ------------------------------------------------------------ flashcards

  /** The sentence at i with the lines around it, as a flashcard keeps it. */
  const sentenceOf = (i: number) => {
    const s = segments[i];
    return {
      sourceKey: `web:${recording.id}`,
      sourceTitle: recording.title,
      segIndex: i,
      start: s.start,
      end: s.end,
      text: s.text,
      before: segments[i - 1]?.text ?? null,
      after: segments[i + 1]?.text ?? null,
      speaker: s.speaker ?? null,
    };
  };

  /** A miss becomes a flashcard: the sentence, with the words not heard as blanks. */
  const keepMiss = (i: number, g: Grade) => {
    const missed = missedWords(g);
    if (!missed.length) return;
    cardRequest({ action: 'miss', ...sentenceOf(i), missed })
      .then((c) => c && setCards((prev) => ({ ...prev, [i]: { ...cardInfo(c), explanation: c.explanation ?? prev[i]?.explanation ?? null } })))
      .catch(() => undefined);
  };

  const explain = async () => {
    if (explaining || !graded || !(graded.g.passed || graded.revealed)) return;
    const i = index;
    setExplaining(true);
    setExplainError('');
    try {
      const c = await cardRequest({ action: 'explain', ...sentenceOf(i), missed: missedWords(graded.g), focus: selected || null, force: !selected && !!cards[i]?.explanation });
      if (c) setCards((prev) => ({ ...prev, [i]: cardInfo(c) }));
    } catch (err) {
      setExplainError((err as Error).message);
    } finally {
      setExplaining(false);
    }
  };

  useEffect(() => {
    const onSelect = () => setSelected(selectionIn(sentenceRef.current));
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  const check = () => {
    const prev = results[index];
    if (isDone(prev) && typed === prev.typed) {
      if (index < segments.length - 1) goTo(index + 1, true);
      else setNote('You reached the end of the recording.');
      return;
    }
    // Nothing typed beyond the word we filled in: Enter plays the sentence, as with an empty box.
    if (!typed.trim() || typed.trim() === openerOf(seg.text).trim()) {
      playSegment(true);
      return;
    }
    const g = grade(seg.text, typed);
    const revealed = !!prev?.revealed;
    record({ typed, score: revealed ? prev.score : Math.max(prev?.score ?? 0, g.score), passed: g.passed, revealed });
    setGraded({ g, revealed });
    // The first honest attempt decides what goes on the card; later checks of half-typed text would add noise.
    if (!g.passed && !prev) keepMiss(index, g);
  };

  const giveHint = () => {
    const v = hint(seg.text, typed);
    setTyped(v);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(v.length, v.length);
    });
  };

  const showAnswer = () => {
    const g = grade(seg.text, typed);
    const prev = results[index];
    record({ typed, score: prev?.score ?? g.score, passed: g.passed, revealed: true });
    setGraded({ g, revealed: true });
    if (!g.passed && !prev?.revealed) keepMiss(index, g);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const digit = e.key === '1' || e.key === '2' || e.key === '3';
    if (digit && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const el = e.currentTarget;
      el.setRangeText(e.key, el.selectionStart, el.selectionEnd, 'end');
      setTyped(el.value);
      return;
    }
    if (digit && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (e.key === '1') togglePlay();
      else nudge(e.key === '2' ? -NUDGE : NUDGE);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      check();
      return;
    }
    if (e.altKey) {
      const map: Record<string, () => void> = {
        KeyH: giveHint,
        KeyA: showAnswer,
        KeyE: () => void explain(),
        KeyL: () => setLoop((l) => !l),
        ArrowLeft: () => goTo(index - 1, true),
        ArrowRight: () => goTo(index + 1, true),
      };
      const fn = map[e.nativeEvent.code];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
  };

  // ------------------------------------------------------------ saving
  const payload = useCallback(() => {
    const seconds = Math.min(3600, Math.round(played.current));
    played.current -= seconds;
    return JSON.stringify({
      key: `web:${recording.id}`,
      title: recording.title,
      source: 'web',
      fp,
      total: segments.length,
      index: state.current.index,
      results: state.current.results,
      day: localDay(),
      playedSeconds: seconds,
    });
  }, [fp, recording.id, recording.title, segments.length]);

  useEffect(() => {
    const id = window.setInterval(async () => {
      if (!dirty.current && played.current < 15) return;
      dirty.current = false;
      setSaveState('saving');
      try {
        const res = await fetch('/api/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload() });
        setSaveState(res.ok ? 'saved' : 'error');
      } catch {
        dirty.current = true;
        setSaveState('error');
      }
    }, 2000);
    const flush = () => {
      if (document.visibilityState === 'hidden' && (dirty.current || played.current >= 1)) {
        dirty.current = false;
        navigator.sendBeacon('/api/progress', new Blob([payload()], { type: 'application/json' }));
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [payload]);

  // ------------------------------------------------------------ view
  const done = Object.values(results).filter(isDone).length;
  const scored = Object.values(results);
  const avg = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 100) : 0;
  const pct = Math.round((done / Math.max(1, segments.length)) * 100);
  const r = results[index];
  const passed = !!graded?.g.passed;
  const canExplain = !!graded && (graded.g.passed || graded.revealed);
  const card = cards[index];

  if (!seg) return <p className="text-ink-2">This recording has no sentences to practise.</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/recordings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeftIcon className="size-4" />
            Recordings
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{recording.title}</h1>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="tabular-nums">
            <span className="font-medium text-foreground">{done}</span> of {segments.length} sentences · {pct}%{scored.length ? ` · ~${avg}% right` : ''}
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-1 text-xs">
            {saveState === 'saving' ? (
              'Saving…'
            ) : saveState === 'error' ? (
              <>
                <ExclamationTriangleIcon className="size-3.5 text-warning" /> Not saved, retrying
              </>
            ) : (
              <>
                <CheckCircleIcon className="size-3.5 text-success" /> Saved
              </>
            )}
          </div>
        </div>
      </div>
      <Progress value={pct} className="mt-3 h-1.5" indicatorClassName="bg-success" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            {recording.sourceType === 'youtube' ? (
              <div ref={ytRef} className="aspect-video w-full bg-black [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" />
            ) : recording.mediaType?.startsWith('audio') ? (
              <div className="flex flex-col items-center gap-4 bg-muted/50 px-6 py-10">
                <MusicalNoteIcon className={cn('size-12 text-primary', playing && 'animate-pulse')} />
                <audio ref={videoRef} src={recording.mediaUrl ?? undefined} preload="auto" className="w-full" controls />
              </div>
            ) : (
              <video ref={videoRef} src={recording.mediaUrl ?? undefined} preload="auto" playsInline controls className="aspect-video w-full bg-black" />
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold">Sentences</h2>
              <span className="text-xs text-muted-foreground">Finished ones un-blur</span>
            </div>
            <ol ref={listRef} className="max-h-[420px] overflow-y-auto p-2">
              {segments.map((s, i) => {
                const doneRow = isDone(results[i]);
                return (
                  <li key={i} data-i={i}>
                    <button
                      onClick={() => goTo(i, true)}
                      className={cn(
                        'flex w-full gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        i === index ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      <span className={cn('w-12 shrink-0 pt-0.5 font-mono text-xs tabular-nums', i === index ? 'text-primary' : 'text-muted-foreground')}>
                        {fmt(s.start)}
                      </span>
                      <span>
                        {s.speaker && <span className="mr-1 font-medium">{s.speaker}:</span>}
                        <span className={doneRow ? 'text-foreground' : 'select-none text-muted-foreground blur-[5px]'}>{s.text}</span>
                      </span>
                      {doneRow &&
                        (results[i].passed ? (
                          <CheckCircleIcon className="ml-auto size-4 shrink-0 text-success" />
                        ) : (
                          <EyeIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
                        ))}
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="tabular-nums text-muted-foreground">
                Sentence {index + 1} / {segments.length} · {fmt(seg.start)}
              </span>
              {seg.speaker && <span className="truncate font-medium text-primary">{seg.speaker}</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => goTo(index - 1, true)} title="Previous (Alt+←)" aria-label="Previous sentence">
                <BackwardIcon />
              </Button>
              <Button className="min-w-[96px]" onClick={togglePlay} title="Play / pause (1)">
                {playing ? <PauseIcon /> : <PlayIcon />}
                {playing ? 'Pause' : 'Play'}
              </Button>
              <Button variant="outline" onClick={() => nudge(-NUDGE)} title="Back 2 s (2)" className="px-3 tabular-nums">−2s</Button>
              <Button variant="outline" onClick={() => nudge(NUDGE)} title="Forward 2 s (3)" className="px-3 tabular-nums">+2s</Button>
              <Button variant="outline" size="icon" onClick={() => goTo(index + 1, true)} title="Next (Alt+→)" aria-label="Next sentence">
                <ForwardIcon />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={cn(loop && 'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')}
                onClick={() => setLoop(!loop)}
                title="Loop (Alt+L)"
                aria-label="Loop the sentence"
                aria-pressed={loop}
              >
                <ArrowPathRoundedSquareIcon />
              </Button>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                value={rate}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRate(v);
                  portRef.current?.setRate(v);
                }}
              >
                {RATES.map((x) => (
                  <option key={x} value={x}>{x}×</option>
                ))}
              </select>
            </div>

            <Textarea
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              autoComplete="off"
              rows={4}
              placeholder="Type what you hear…  (1 = play, Enter = check)"
              className={cn('mt-4 resize-y text-base', passed && 'border-success focus-visible:ring-success')}
            />

            {note && <p className="mt-3 text-sm font-medium text-muted-foreground">{note}</p>}
            {graded && (
              <div className="mt-3">
                <p className={cn('text-sm font-medium', graded.g.passed ? 'text-success' : 'text-destructive')}>
                  {graded.g.passed
                    ? 'Perfect. Enter for the next sentence'
                    : graded.revealed
                      ? 'Answer shown. Type it out, or Enter to move on'
                      : (() => {
                          const n = graded.g.words.filter((w) => w.state === 'missing' || w.state === 'partial').length;
                          return `${Math.round(graded.g.score * 100)}% · ${n} word${n === 1 ? '' : 's'} to fix`;
                        })()}
                </p>
                <div ref={sentenceRef}>
                  <GradeView g={graded.g} revealed={graded.revealed} />
                </div>
              </div>
            )}

            {canExplain && card?.explanation ? (
              <div className="mt-3 rounded-lg border bg-muted/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <SparklesIcon className="size-3.5" /> AI explanation
                  </span>
                  <Link href="/app/cards" className="hover:text-foreground">Saved to Flashcards</Link>
                </div>
                <ExplanationView e={card.explanation} focus={card.focus} />
              </div>
            ) : card ? (
              <p className="mt-2 text-xs text-muted-foreground">
                The words you missed are saved to <Link href="/app/cards" className="text-primary hover:underline">Flashcards</Link>.
              </p>
            ) : null}
            {explainError && <p className="mt-2 text-sm text-destructive">{explainError}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={check}>
                {isDone(r) && typed === r?.typed ? 'Next' : 'Check'}
                <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 font-mono text-[10px]">Enter</kbd>
              </Button>
              <Button variant="outline" onClick={giveHint}>Hint</Button>
              <Button variant="outline" onClick={showAnswer}>Show answer</Button>
              {canExplain && (
                <Button
                  variant="outline"
                  // Keep the phrase selected in the sentence while the button is pressed.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void explain()}
                  disabled={explaining}
                  title="Explain with AI (Alt+E). Select a phrase in the sentence to ask about it."
                  className="max-w-full"
                >
                  <SparklesIcon className="text-primary" />
                  <span className="truncate">
                    {explaining ? 'Explaining…' : selected ? `Explain “${selected}”` : card?.explanation ? 'Explain again' : 'Explain'}
                  </span>
                </Button>
              )}
            </div>
            {canExplain && !card?.explanation && !explaining && (
              <p className="mt-2 text-xs text-muted-foreground">Not sure what it means? Select a phrase above, then Explain. It is saved to your flashcards.</p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
              <span><span className="kbd">1</span> play</span>
              <span><span className="kbd">2</span>/<span className="kbd">3</span> ±2s</span>
              <span><span className="kbd">Enter</span> check · next</span>
              <span><span className="kbd">Alt H</span> hint</span>
              <span><span className="kbd">Alt A</span> answer</span>
              <span><span className="kbd">Alt E</span> explain</span>
              <span><span className="kbd">Alt ←/→</span> move</span>
              <span><span className="kbd">Ctrl 1</span> types “1”</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
