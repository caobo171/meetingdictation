/**
 * Where the transcript comes from, per site. Every adapter returns timed cues;
 * nothing downstream knows which site it is on.
 *
 *  1. YouTube: the watch page's caption track (json3), else YouTube's own
 *     "Show transcript" panel.
 *  2. Any <video> with a captions/subtitles <track> (Loom, most LMS and
 *     self-hosted players, many meeting-recording pages).
 *  3. Loom's transcript list, when the track is missing.
 *  4. A .vtt / .srt / timestamped .txt the learner picks (Zoom, Teams, Meet,
 *     Drive all let you download one) - handled by the panel.
 */

import { type Cue, parseClock, rowsToCues } from '@md/core';

export type SourceKind = 'youtube' | 'captions' | 'loom' | 'file';

export interface Source {
  kind: SourceKind;
  label: string;
  cues: Cue[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(get: () => T | null | undefined, timeoutMs: number, everyMs = 200): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > until) return null;
    await sleep(everyMs);
  }
}

/** The main video: the largest one on screen that is a real recording, not a hover preview. */
export function findVideo(): HTMLVideoElement | null {
  const videos = [...document.querySelectorAll('video')];
  let best: HTMLVideoElement | null = null;
  let bestScore = -1;
  for (const v of videos) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    const longEnough = !Number.isFinite(v.duration) || v.duration > 15 || v.readyState === 0;
    const score = area * (longEnough ? 1 : 0.01) + (v.textTracks.length ? 1 : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

export function isYouTube(): boolean {
  return /(^|\.)youtube\.com$/.test(location.hostname);
}

export function isLoom(): boolean {
  return /(^|\.)loom\.com$/.test(location.hostname);
}

export function youTubeVideoId(): string | null {
  const u = new URL(location.href);
  return u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/)?.[1] || null;
}

// ---------------------------------------------------------------- captions track

export async function cuesFromTracks(video: HTMLVideoElement): Promise<{ cues: Cue[]; label: string } | null> {
  const tracks = [...video.textTracks].filter((t) => t.kind === 'captions' || t.kind === 'subtitles');
  if (!tracks.length) return null;
  for (const t of tracks) if (t.mode === 'disabled') t.mode = 'hidden'; // loads the cues without drawing them
  const lang = (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
  const ready = await waitFor(() => {
    const loaded = tracks.filter((t) => (t.cues?.length ?? 0) > 0);
    if (!loaded.length) return null;
    return loaded.find((t) => t.language?.startsWith('en')) ?? loaded.find((t) => t.language?.startsWith(lang)) ?? loaded[0];
  }, 6000);
  if (!ready?.cues) return null;
  const cues: Cue[] = [...ready.cues].map((c) => ({
    start: c.startTime,
    end: c.endTime,
    text: (c as VTTCue).text ?? '',
  }));
  return { cues, label: ready.label || ready.language || 'captions' };
}

// ---------------------------------------------------------------- YouTube

interface YtTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string; runs?: { text: string }[] };
}

async function youTubeCaptionTracks(id: string): Promise<YtTrack[]> {
  const html = await fetch(`/watch?v=${encodeURIComponent(id)}`, { credentials: 'include' }).then((r) => r.text());
  const at = html.indexOf('"captionTracks":');
  if (at < 0) return [];
  // The array is JSON; find its end by bracket counting (string contents can hold "]").
  const startIdx = html.indexOf('[', at);
  let depth = 0;
  let inStr = false;
  for (let i = startIdx; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(startIdx, i + 1)) as YtTrack[];
    }
  }
  return [];
}

function pickYtTrack(tracks: YtTrack[]): YtTrack | undefined {
  const en = (t: YtTrack) => t.languageCode.startsWith('en');
  return (
    tracks.find((t) => en(t) && t.kind !== 'asr') ??
    tracks.find((t) => en(t)) ??
    tracks.find((t) => t.kind !== 'asr') ??
    tracks[0]
  );
}

async function cuesFromYouTubeApi(id: string): Promise<{ cues: Cue[]; label: string } | null> {
  const track = pickYtTrack(await youTubeCaptionTracks(id));
  if (!track) return null;
  const res = await fetch(`${track.baseUrl}&fmt=json3`, { credentials: 'include' });
  const body = await res.text();
  if (!body.trim()) return null; // YouTube now often wants a proof-of-origin token; fall back to the panel
  const data = JSON.parse(body) as { events?: { tStartMs: number; dDurationMs?: number; segs?: { utf8: string }[] }[] };
  const cues: Cue[] = (data.events ?? [])
    .filter((e) => e.segs)
    .map((e) => ({
      start: e.tStartMs / 1000,
      end: (e.tStartMs + (e.dDurationMs ?? 2000)) / 1000,
      text: e.segs!.map((s) => s.utf8).join('').replace(/\n/g, ' ').trim(),
    }))
    .filter((c) => c.text);
  if (!cues.length) return null;
  const name = track.name?.simpleText ?? track.name?.runs?.map((r) => r.text).join('') ?? track.languageCode;
  return { cues, label: `YouTube · ${name}` };
}

// YouTube ships two transcript panels: the classic one and the newer "In this video" view model.
const YT_ROW = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
const YT_TIME = '.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp';
const YT_TEXT = '.segment-text, transcript-segment-view-model > [role="text"], transcript-segment-view-model > .ytAttributedStringHost';

function ytPanelRows(): Element[] {
  return [...document.querySelectorAll(YT_ROW)];
}

function ytRow(row: Element): { start: number; textEl: HTMLElement | null } {
  return {
    start: parseClock(row.querySelector(YT_TIME)?.textContent ?? ''),
    textEl: row.querySelector<HTMLElement>(YT_TEXT),
  };
}

/** YouTube plays ads in the same <video>; its duration and time mean nothing then. */
export function youTubeAdShowing(): boolean {
  return !!document.querySelector('#movie_player.ad-showing, .html5-video-player.ad-showing');
}

async function openYouTubeTranscriptPanel(): Promise<boolean> {
  if (ytPanelRows().length) return true;
  const button =
    document.querySelector<HTMLElement>('ytd-video-description-transcript-section-renderer button') ??
    [...document.querySelectorAll<HTMLElement>('button, tp-yt-paper-item')].find((b) =>
      /show transcript/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
    );
  if (!button) {
    // The button lives in the collapsed description; expand it first.
    document.querySelector<HTMLElement>('#description-inline-expander #expand, tp-yt-paper-button#expand')?.click();
    await sleep(400);
  }
  (
    button ??
    document.querySelector<HTMLElement>('ytd-video-description-transcript-section-renderer button')
  )?.click();
  return !!(await waitFor(() => (ytPanelRows().length ? true : null), 6000));
}

async function cuesFromYouTubePanel(video: HTMLVideoElement | null): Promise<{ cues: Cue[]; label: string } | null> {
  if (!(await openYouTubeTranscriptPanel())) return null;
  const rows = ytPanelRows()
    .map((r) => {
      const { start, textEl } = ytRow(r);
      return { start, text: (textEl?.textContent ?? '').trim() };
    })
    .filter((r) => Number.isFinite(r.start) && r.text);
  if (!rows.length) return null;
  return { cues: rowsToCues(rows, youTubeAdShowing() ? undefined : video?.duration), label: 'YouTube transcript' };
}

// ---------------------------------------------------------------- Loom list

function loomRowEls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid^="transcript-row-"]')];
}

async function cuesFromLoomList(video: HTMLVideoElement | null): Promise<{ cues: Cue[]; label: string } | null> {
  if (!loomRowEls().length) document.querySelector<HTMLElement>('[data-testid="sidebar-tab-Transcript"]')?.click();
  await waitFor(() => (loomRowEls().length ? true : null), 5000);
  let speaker: string | undefined;
  const rows = loomRowEls()
    .map((row) => {
      const lines = row.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
      const text = row.querySelector('[dir="ltr"]')?.textContent?.trim() ?? '';
      const start = parseClock(lines[0] ?? '');
      if (lines.length >= 3 && lines[1] !== text) speaker = lines[1];
      return { start, text, speaker };
    })
    .filter((r) => Number.isFinite(r.start) && r.text);
  if (!rows.length) return null;
  return { cues: rowsToCues(rows, video?.duration), label: 'Loom transcript' };
}

// ---------------------------------------------------------------- entry

export async function detectSource(video: HTMLVideoElement | null): Promise<Source | null> {
  if (isYouTube()) {
    const id = youTubeVideoId();
    if (id) {
      const api = await cuesFromYouTubeApi(id).catch(() => null);
      if (api) return { kind: 'youtube', ...api };
      const panel = await cuesFromYouTubePanel(video).catch(() => null);
      if (panel) return { kind: 'youtube', ...panel };
    }
  }
  if (video) {
    const tracks = await cuesFromTracks(video).catch(() => null);
    if (tracks) return { kind: 'captions', ...tracks };
  }
  if (isLoom()) {
    const list = await cuesFromLoomList(video).catch(() => null);
    if (list) return { kind: 'loom', ...list };
  }
  return null;
}

/**
 * Transcript rows the site shows next to the video, with their start times,
 * so a row can be un-blurred once every segment in it has been dictated.
 */
export function visibleTranscriptRows(): { el: HTMLElement; start: number }[] {
  if (isLoom()) {
    return loomRowEls()
      .map((row) => ({
        el: row.querySelector<HTMLElement>('[dir="ltr"]')!,
        start: parseClock(row.innerText.split('\n')[0] ?? ''),
      }))
      .filter((r) => r.el && Number.isFinite(r.start));
  }
  if (isYouTube()) {
    return ytPanelRows()
      .map((row) => {
        const { start, textEl } = ytRow(row);
        return { el: textEl!, start };
      })
      .filter((r) => r.el && Number.isFinite(r.start));
  }
  return [];
}
