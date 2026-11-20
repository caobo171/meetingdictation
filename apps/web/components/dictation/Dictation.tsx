'use client';

import {
  buildSegments,
  grade,
  hasWords,
  hint,
  isDone,
  transcriptFingerprint,
  type Cue,
  type Grade,
  type Result,
  type Results,
  type Segment,
} from '@md/core';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
}

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

export function Dictation({ recording, initial }: DictationProps) {
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
      setTyped(r?.typed ?? '');
      setGraded(r ? { g: grade(segments[next].text, r.typed), revealed: r.revealed } : null);
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

  const check = () => {
    const prev = results[index];
    if (isDone(prev) && typed === prev.typed) {
      if (index < segments.length - 1) goTo(index + 1, true);
      else setNote('🎉 You reached the end of the recording!');
      return;
    }
    if (!typed.trim()) {
      playSegment(true);
      return;
    }
    const g = grade(seg.text, typed);
    const revealed = !!prev?.revealed;
    record({ typed, score: revealed ? prev.score : Math.max(prev?.score ?? 0, g.score), passed: g.passed, revealed });
    setGraded({ g, revealed });
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

  if (!seg) return <p className="text-ink-2">This recording has no sentences to practise.</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/recordings" className="text-sm font-semibold text-ink-3 hover:text-ink">
            ← Recordings
          </Link>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight">{recording.title}</h1>
        </div>
        <div className="text-right text-sm text-ink-3">
          <div>
            <b className="text-ink">{done}</b> of {segments.length} sentences · {pct}%{scored.length ? ` · ~${avg}% right` : ''}
          </div>
          <div className="text-xs">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? '⚠️ Not saved, retrying' : '✓ Saved'}</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg2">
        <div className="h-full rounded-full bg-good transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            {recording.sourceType === 'youtube' ? (
              <div ref={ytRef} className="aspect-video w-full bg-black [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" />
            ) : recording.mediaType?.startsWith('audio') ? (
              <div className="flex flex-col items-center gap-3 bg-brand-soft/60 px-6 py-10">
                <div className={`text-5xl ${playing ? 'animate-pulse' : ''}`}>🎧</div>
                <audio ref={videoRef} src={recording.mediaUrl ?? undefined} preload="auto" className="w-full" controls />
              </div>
            ) : (
              <video ref={videoRef} src={recording.mediaUrl ?? undefined} preload="auto" playsInline controls className="aspect-video w-full bg-black" />
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="font-bold">Sentences</h2>
              <span className="text-xs text-ink-3">finished ones un-blur</span>
            </div>
            <ol ref={listRef} className="max-h-[420px] overflow-y-auto p-2">
              {segments.map((s, i) => {
                const doneRow = isDone(results[i]);
                return (
                  <li key={i} data-i={i}>
                    <button
                      onClick={() => goTo(i, true)}
                      className={`flex w-full gap-3 rounded-xl px-3 py-2 text-left text-[14px] transition ${
                        i === index ? 'bg-brand-soft' : 'hover:bg-bg2/70'
                      }`}
                    >
                      <span className={`w-12 shrink-0 pt-0.5 font-mono text-xs ${i === index ? 'text-brand' : 'text-ink-3'}`}>{fmt(s.start)}</span>
                      <span>
                        {s.speaker && <b className="mr-1 text-ink-2">{s.speaker}:</b>}
                        <span className={doneRow ? 'text-ink' : 'select-none text-ink-2 blur-[5px]'}>{s.text}</span>
                      </span>
                      {doneRow && <span className="ml-auto shrink-0 text-good">{results[i].passed ? '✓' : '👁'}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="card p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-2">
                Sentence {index + 1} / {segments.length} · {fmt(seg.start)}
              </span>
              {seg.speaker && <span className="truncate font-semibold text-brand">{seg.speaker}</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-ghost px-3" onClick={() => goTo(index - 1, true)} title="Previous (Alt+←)">⏮</button>
              <button className="btn-primary min-w-[104px]" onClick={togglePlay} title="Play / pause (1)">
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button className="btn-ghost px-3" onClick={() => nudge(-NUDGE)} title="Back 2 s (2)">−2s</button>
              <button className="btn-ghost px-3" onClick={() => nudge(NUDGE)} title="Forward 2 s (3)">+2s</button>
              <button className="btn-ghost px-3" onClick={() => goTo(index + 1, true)} title="Next (Alt+→)">⏭</button>
              <button
                className={`btn-ghost px-3 ${loop ? '!border-brand !bg-brand-soft' : ''}`}
                onClick={() => setLoop(!loop)}
                title="Loop (Alt+L)"
              >
                🔁
              </button>
              <select
                className="rounded-xl border border-line bg-paper px-2 py-2 text-sm"
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

            <textarea
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              autoComplete="off"
              rows={4}
              placeholder="Type what you hear…  (1 = play, Enter = check)"
              className={`input mt-4 resize-y text-[16px] ${passed ? '!border-good' : ''}`}
            />

            {note && <p className="mt-3 text-sm font-semibold text-bad">{note}</p>}
            {graded && (
              <div className="mt-3">
                <p className={`text-sm font-semibold ${graded.g.passed ? 'text-good' : 'text-bad'}`}>
                  {graded.g.passed
                    ? '✓ Perfect! Enter for the next sentence'
                    : graded.revealed
                      ? 'Answer shown. Type it out, or Enter to move on'
                      : (() => {
                          const n = graded.g.words.filter((w) => w.state === 'missing' || w.state === 'partial').length;
                          return `${Math.round(graded.g.score * 100)}% · ${n} word${n === 1 ? '' : 's'} to fix`;
                        })()}
                </p>
                <GradeView g={graded.g} revealed={graded.revealed} />
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={check}>
                {isDone(r) && typed === r?.typed ? 'Next ⏎' : 'Check ⏎'}
              </button>
              <button className="btn-ghost" onClick={giveHint}>Hint</button>
              <button className="btn-ghost" onClick={showAnswer}>Show answer</button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 text-xs text-ink-3">
              <span><span className="kbd">1</span> play</span>
              <span><span className="kbd">2</span>/<span className="kbd">3</span> ±2s</span>
              <span><span className="kbd">Enter</span> check · next</span>
              <span><span className="kbd">Alt H</span> hint</span>
              <span><span className="kbd">Alt A</span> answer</span>
              <span><span className="kbd">Alt ←/→</span> move</span>
              <span><span className="kbd">Ctrl 1</span> types “1”</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
