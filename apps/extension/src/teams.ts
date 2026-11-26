/**
 * Teams' Recap view: the recording plays in one cross-origin SharePoint frame
 * and its transcript lives in another, so the panel (in the Teams page) can
 * reach neither. `frame.ts` runs inside those SharePoint frames and does the
 * work there; this file is the Teams side and the message protocol.
 *
 *   Teams page ──postMessage──▶ SharePoint frames: hello, play, pause, seek,
 *                                rate, blur, cues
 *   SharePoint frame ──▶ Teams page: ready, video (player state), played,
 *                                cues (the transcript)
 */

import type { Cue } from '@md/core';
import type { BlankHost, LineState } from './inline';
import type { KeyAction } from './keys';
import type { Entry } from './onetranscript';
import type { TranscriptLine } from './sources';

export const TAG = '__meetingDictation';

export interface PlayerState {
  t: number;
  paused: boolean;
  rate: number;
  duration: number;
  ended: boolean;
  ready: number;
}

export type ToFrame =
  | { op: 'hello' }
  | { op: 'play'; id: number }
  | { op: 'pause' }
  | { op: 'seek'; t: number }
  | { op: 'rate'; r: number }
  | { op: 'blur'; on: boolean }
  | { op: 'cues'; id: number; site: string; uniqueId: string }
  | { op: 'inline-attach'; entries: Entry[]; states: (LineState | null)[]; ratio: number; current: number }
  | { op: 'inline-detach' }
  | { op: 'inline-ratio'; r: number }
  | { op: 'inline-current'; i: number; scroll: boolean }
  | { op: 'inline-playing'; i: number }
  | { op: 'inline-paint'; i: number; state: LineState | null }
  | { op: 'inline-focus'; i: number; keep: boolean }
  | { op: 'inline-hint'; i: number };

/** What line i holds right now in the transcript frame, so the panel can grade it without asking. */
export interface LineSnapshot {
  i: number;
  typed: string;
  empty: boolean;
  grade: { score: number; passed: boolean; wrong: number; missed?: string[] };
}

export type FromFrame =
  | { op: 'ready' }
  | { op: 'video'; state: PlayerState }
  | { op: 'played'; id: number; error?: string }
  | { op: 'cues'; id: number; result: { cues: Cue[]; ids: string[]; label: string; streamUrl?: string } | null }
  | { op: 'inline-lines'; lines: LineSnapshot[] }
  | { op: 'inline-select'; i: number }
  | { op: 'inline-seek'; i: number }
  | { op: 'inline-check'; i: number }
  | { op: 'inline-key'; action: KeyAction };

const TEAMS_HOST = /^(teams\.cloud\.microsoft|teams\.microsoft\.com|teams\.live\.com)$/;

export function isTeamsOrigin(origin: string): boolean {
  try {
    return new URL(origin).protocol === 'https:' && TEAMS_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function isTeams(): boolean {
  return window.top === window && TEAMS_HOST.test(location.hostname);
}

// ---------------------------------------------------------------- Teams side

/** The recording on screen: its SharePoint site and file id, from the form that loads Recap's frame. */
export function teamsRecording(): { site: string; uniqueId: string } | null {
  if (!isTeams()) return null;
  // The latest form whose frame is still on the page: Teams can leave an earlier meeting's form behind.
  const action = [...document.querySelectorAll<HTMLFormElement>('form')]
    .filter((f) => /\.sharepoint\.com\/.*\/_layouts\/15\/xplatplugins\.aspx\?.*uniqueId=/i.test(f.action))
    .filter((f) => !f.target || document.getElementsByName(f.target).length > 0)
    .map((f) => f.action)
    .pop();
  if (!action) return null;
  const u = new URL(action);
  const uniqueId = u.searchParams.get('uniqueId');
  const at = u.pathname.toLowerCase().indexOf('/_layouts/15/');
  if (!uniqueId || at < 0) return null;
  return { site: `${u.origin}${u.pathname.slice(0, at)}`, uniqueId };
}

function frameWindows(win: Window = window, out: Window[] = []): Window[] {
  for (let i = 0; i < win.frames.length; i += 1) {
    const f = win.frames[i];
    out.push(f);
    try {
      frameWindows(f, out);
    } catch {
      /* a frame went away mid-walk */
    }
  }
  return out;
}

function broadcast(msg: ToFrame): void {
  for (const f of frameWindows()) {
    try {
      f.postMessage({ [TAG]: msg }, '*');
    } catch {
      /* detached */
    }
  }
}

let blurOn = false;

export function teamsBlur(on: boolean): void {
  blurOn = on;
  broadcast({ op: 'blur', on });
}

const now = () => performance.now();

/** A video in another frame, looking enough like an HTMLVideoElement for the panel. */
class RemoteVideo {
  private s: PlayerState = { t: 0, paused: true, rate: 1, duration: NaN, ended: false, ready: 0 };
  private at = now();
  /** Until then, a report contradicting our own last command is one sent before it arrived. */
  private hold = 0;
  private plays = new Map<number, { ok(): void; fail(e: DOMException): void }>();
  readonly textTracks = Object.assign([] as TextTrack[], { addEventListener() {}, removeEventListener() {} });

  constructor(private win: Window) {}

  private send(msg: ToFrame): void {
    this.hold = now() + 800;
    try {
      this.win.postMessage({ [TAG]: msg }, '*');
    } catch {
      /* the frame was replaced */
    }
  }

  update(state: PlayerState): void {
    if (now() < this.hold && (state.paused !== this.s.paused || Math.abs(state.t - this.currentTime) > 1)) return;
    this.s = state;
    this.at = now();
  }

  played(id: number, error?: string): void {
    const p = this.plays.get(id);
    this.plays.delete(id);
    if (!p) return;
    if (error) {
      this.s.paused = true;
      p.fail(new DOMException(error, error));
    } else p.ok();
  }

  get currentTime(): number {
    if (this.s.paused) return this.s.t;
    const t = this.s.t + ((now() - this.at) / 1000) * this.s.rate;
    return Number.isFinite(this.s.duration) ? Math.min(t, this.s.duration) : t;
  }

  set currentTime(t: number) {
    this.s.t = t;
    this.s.ended = false;
    this.at = now();
    this.send({ op: 'seek', t });
  }

  get playbackRate(): number {
    return this.s.rate;
  }

  set playbackRate(r: number) {
    this.s.t = this.currentTime;
    this.at = now();
    this.s.rate = r;
    this.send({ op: 'rate', r });
  }

  get paused(): boolean {
    return this.s.paused;
  }

  get ended(): boolean {
    return this.s.ended;
  }

  get duration(): number {
    return this.s.duration;
  }

  get readyState(): number {
    return this.s.ready;
  }

  play(): Promise<void> {
    const id = Math.floor(Math.random() * 1e9);
    this.s.t = this.currentTime;
    this.s.paused = false;
    this.at = now();
    this.send({ op: 'play', id });
    return new Promise((ok, fail) => {
      this.plays.set(id, { ok, fail });
      setTimeout(() => this.played(id), 4000); // no answer: assume it plays
    });
  }

  pause(): void {
    this.s.t = this.currentTime;
    this.s.paused = true;
    this.at = now();
    this.send({ op: 'pause' });
  }

  getBoundingClientRect(): DOMRect {
    return new DOMRect(0, 0, 1, 1);
  }
}

const players = new Map<Window, RemoteVideo>();
const cueWaits = new Map<number, (r: FromFrame & { op: 'cues' }) => void>();

/** The recording's player, once its frame has said hello: the longest video of any frame. */
export function teamsVideo(): HTMLVideoElement | null {
  let best: RemoteVideo | null = null;
  for (const [win, v] of players) {
    if (win.closed) {
      players.delete(win);
      continue;
    }
    if (!best || (v.duration || 0) > (best.duration || 0)) best = v;
  }
  return best as unknown as HTMLVideoElement | null;
}

/** Ask the SharePoint frames for the whole transcript. */
export async function cuesFromTeams(): Promise<{ cues: Cue[]; ids: string[]; label: string; uniqueId: string; streamUrl?: string } | null> {
  const rec = teamsRecording();
  if (!rec) return null;
  const id = Math.floor(Math.random() * 1e9);
  const answer = new Promise<(FromFrame & { op: 'cues' }) | null>((resolve) => {
    cueWaits.set(id, resolve);
    setTimeout(() => {
      cueWaits.delete(id);
      resolve(null);
    }, 15_000);
  });
  broadcast({ op: 'cues', id, ...rec });
  const got = await answer;
  return got?.result ? { ...got.result, uniqueId: rec.uniqueId } : null;
}

/**
 * "Type in the transcript" on Recap: the blanks live in the transcript's
 * SharePoint frame (frame.ts runs InlineBlanks there). This stands in for
 * InlineBlanks in the panel: it forwards each call, and keeps what every line
 * holds, which the frame sends after each change, so grading stays synchronous.
 */
export class RemoteInline {
  private entries: Entry[] = [];
  private snaps = new Map<number, LineSnapshot>();
  private ratio = 1;
  private current = 0;
  private on = false;

  constructor(
    private host: BlankHost,
    private stateOf: (i: number) => LineState | undefined,
  ) {}

  attach(lines: TranscriptLine[]): void {
    remoteInline = this;
    this.on = true;
    this.snaps.clear();
    this.entries = lines.map((l, k) => ({ id: l.id ?? String(k), start: l.start, end: l.end ?? l.start, text: l.text, speaker: l.speaker }));
    broadcast({
      op: 'inline-attach',
      entries: this.entries,
      states: this.entries.map((_, i) => this.stateOf(i) ?? null),
      ratio: this.ratio,
      current: this.current,
    });
  }

  detach(): void {
    if (!this.on) return;
    this.on = false;
    broadcast({ op: 'inline-detach' });
  }

  get attached(): boolean {
    return this.on;
  }

  setRatio(ratio: number): void {
    this.ratio = ratio;
    if (this.on) broadcast({ op: 'inline-ratio', r: ratio });
  }

  private playingLine = -1;

  setPlaying(i: number): void {
    if (i === this.playingLine) return;
    this.playingLine = i;
    if (this.on) broadcast({ op: 'inline-playing', i });
  }

  setCurrent(i: number, scroll: boolean): void {
    this.current = i;
    if (this.on) broadcast({ op: 'inline-current', i, scroll });
  }

  typed(i: number): string {
    return this.snaps.get(i)?.typed ?? this.stateOf(i)?.typed ?? '';
  }

  isEmpty(i: number): boolean {
    return this.snaps.get(i)?.empty ?? true;
  }

  grade(i: number): { score: number; passed: boolean; wrong: number; missed?: string[] } {
    return this.snaps.get(i)?.grade ?? { score: 0, passed: false, wrong: 1 };
  }

  paint(i: number): void {
    broadcast({ op: 'inline-paint', i, state: this.stateOf(i) ?? null });
  }

  focus(i: number, keep = false): void {
    broadcast({ op: 'inline-focus', i, keep });
  }

  hint(i: number): void {
    broadcast({ op: 'inline-hint', i });
  }

  /** A message from the transcript frame. */
  fromFrame(msg: FromFrame): void {
    if (!this.on) return;
    if (msg.op === 'inline-lines') for (const l of msg.lines) this.snaps.set(l.i, l);
    else if (msg.op === 'inline-select') this.host.select(msg.i);
    else if (msg.op === 'inline-seek') this.host.seek(msg.i);
    else if (msg.op === 'inline-check') this.host.check(msg.i);
    else if (msg.op === 'inline-key') this.host.key(msg.action);
  }
}

let remoteInline: RemoteInline | null = null;
let started = false;

/** Listen for the SharePoint frames. Call once, on Teams. */
export function startTeamsBridge(): void {
  if (started || !isTeams()) return;
  started = true;
  window.addEventListener('message', (e) => {
    const msg = (e.data as Record<string, unknown> | null)?.[TAG] as FromFrame | undefined;
    if (!msg || typeof msg !== 'object' || !/^https:\/\/[^/]+\.sharepoint\.com$/.test(e.origin)) return;
    const win = e.source as Window | null;
    if (!win) return;
    switch (msg.op) {
      case 'ready':
        win.postMessage({ [TAG]: { op: 'hello' } satisfies ToFrame }, e.origin);
        win.postMessage({ [TAG]: { op: 'blur', on: blurOn } satisfies ToFrame }, e.origin);
        break;
      case 'video': {
        let v = players.get(win);
        if (!v) players.set(win, (v = new RemoteVideo(win)));
        v.update(msg.state);
        break;
      }
      case 'played':
        players.get(win)?.played(msg.id, msg.error);
        break;
      case 'inline-lines':
      case 'inline-select':
      case 'inline-seek':
      case 'inline-check':
      case 'inline-key':
        remoteInline?.fromFrame(msg);
        break;
      case 'cues': {
        const done = cueWaits.get(msg.id);
        if (done && msg.result) {
          cueWaits.delete(msg.id);
          done(msg);
        }
        break;
      }
    }
  });
  broadcast({ op: 'hello' });
}
