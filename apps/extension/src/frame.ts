/**
 * Runs inside SharePoint frames (manifest: all_frames). It does something only
 * when the frame sits in a Teams page, where Recap puts the recording's player
 * and its transcript in SharePoint frames the Teams page cannot reach. Here it
 * plays and seeks the video, blurs the transcript, and reads the transcript
 * from Stream's API for the panel; see teams.ts for the other side.
 */

import { setBlur } from './blur';
import { InlineBlanks, type LineState } from './inline';
import { loadKeys } from './keys';
import { entryLines, hasOneTranscript, rememberEntries, renderedLines, scrollTowardEntry, type Entry } from './onetranscript';
import { itemFromUniqueId, streamTranscript } from './stream';
import { TAG, isTeamsOrigin, type FromFrame, type LineSnapshot, type PlayerState, type ToFrame } from './teams';

const topOrigin = location.ancestorOrigins?.[location.ancestorOrigins.length - 1] ?? '';

function send(msg: FromFrame): void {
  window.top?.postMessage({ [TAG]: msg }, topOrigin);
}

function biggestVideo(): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let size = -1;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const s = (Number.isFinite(v.duration) ? v.duration * 1e6 : 0) + r.width * r.height;
    if (s > size) {
      best = v;
      size = s;
    }
  }
  return best;
}

let video: HTMLVideoElement | null = null;

function state(v: HTMLVideoElement): PlayerState {
  return { t: v.currentTime, paused: v.paused, rate: v.playbackRate, duration: v.duration, ended: v.ended, ready: v.readyState };
}

function report(): void {
  if (video) send({ op: 'video', state: state(video) });
}

const EVENTS = ['play', 'playing', 'pause', 'seeked', 'timeupdate', 'ratechange', 'durationchange', 'loadedmetadata', 'ended'];

/** Follow the frame's player; the page may swap its <video> for a new one. */
/** The speed the panel asked for. Stream's player sets its own speed back on play and seek. */
let wantRate = 0;
let lastHold = 0;

function holdRate(): void {
  if (!video || !wantRate || video.playbackRate === wantRate) return;
  const t = performance.now();
  if (t - lastHold < 150) return; // the player keeps resetting it: don't fight in a tight loop
  lastHold = t;
  video.playbackRate = wantRate;
}

function track(): HTMLVideoElement | null {
  const v = biggestVideo();
  if (v !== video) {
    video?.removeEventListener('emptied', report);
    for (const ev of EVENTS) video?.removeEventListener(ev, report);
    for (const ev of ['ratechange', 'play', 'playing', 'seeked'] as const) video?.removeEventListener(ev, holdRate);
    video = v;
    for (const ev of EVENTS) video?.addEventListener(ev, report);
    for (const ev of ['ratechange', 'play', 'playing', 'seeked'] as const) video?.addEventListener(ev, holdRate);
    holdRate();
  }
  report();
  return video;
}

async function answerCues(id: number, site: string, uniqueId: string): Promise<void> {
  if (new URL(site).origin !== location.origin) return; // another tenant's frame: its sign-in can't read it
  let result: Extract<FromFrame, { op: 'cues' }>['result'] = null;
  try {
    const found = await itemFromUniqueId(site, uniqueId);
    const transcript = found && (await streamTranscript(found.item));
    if (transcript && found) result = { cues: transcript.cues, ids: transcript.ids, label: transcript.label, streamUrl: found.streamUrl };
  } catch {
    result = null;
  }
  send({ op: 'cues', id, result });
}

// ------------------------------------------------ typing in the transcript

/** The panel's verdict per line (checked, revealed), as it last sent it. */
const states = new Map<number, LineState>();
let entries: Entry[] = [];
let ratio = 1;
let current = 0;
let waitRows = 0;

const blanks = new InlineBlanks(
  {
    select: (i) => {
      current = i;
      send({ op: 'inline-select', i });
    },
    check: (i) => {
      snapshot([i]);
      send({ op: 'inline-check', i });
    },
    seek: (i) => {
      current = i;
      send({ op: 'inline-seek', i });
    },
    key: (action) => send({ op: 'inline-key', action }),
  },
  (i) => states.get(i),
  renderedLines,
  (line) => scrollTowardEntry(line.id),
);

function snapshot(which: number[]): void {
  if (!blanks.attached) return;
  const lines: LineSnapshot[] = which.map((i) => ({ i, typed: blanks.typed(i), empty: blanks.isEmpty(i), grade: blanks.grade(i) }));
  send({ op: 'inline-lines', lines });
}

const all = () => entries.map((_, i) => i);

/** Turn the transcript into blanks once this frame shows it (the Transcript tab may open later). */
function attachWhenShown(): void {
  clearInterval(waitRows);
  const go = () => {
    if (!hasOneTranscript()) return false;
    clearInterval(waitRows);
    blanks.setRatio(ratio);
    blanks.attach(entryLines(entries));
    blanks.setCurrent(current, true);
    snapshot(all());
    return true;
  };
  if (!go()) waitRows = window.setInterval(go, 1000);
}

// Each change to a blank: tell the panel what the line holds now.
document.addEventListener(
  'input',
  (e) => {
    const line = (e.target as Element).closest?.<HTMLElement>('.md-line');
    if (line?.dataset.mdI) snapshot([Number(line.dataset.mdI)]);
  },
  true,
);

function onInline(msg: ToFrame): void {
  switch (msg.op) {
    case 'inline-attach':
      void loadKeys();
      entries = msg.entries;
      rememberEntries(entries);
      ratio = msg.ratio;
      current = msg.current;
      states.clear();
      msg.states.forEach((st, i) => st && states.set(i, st));
      attachWhenShown();
      break;
    case 'inline-detach':
      clearInterval(waitRows);
      blanks.detach();
      break;
    case 'inline-ratio':
      ratio = msg.r;
      blanks.setRatio(msg.r);
      snapshot(all());
      break;
    case 'inline-playing':
      if (blanks.attached) blanks.setPlaying(msg.i);
      break;
    case 'inline-current':
      current = msg.i;
      if (blanks.attached) blanks.setCurrent(msg.i, msg.scroll);
      break;
    case 'inline-paint':
      if (msg.state) states.set(msg.i, msg.state);
      else states.delete(msg.i);
      blanks.paint(msg.i);
      snapshot([msg.i]);
      break;
    case 'inline-focus':
      blanks.focus(msg.i, msg.keep);
      break;
    case 'inline-hint':
      blanks.hint(msg.i);
      snapshot([msg.i]);
      break;
  }
}

function onMessage(e: MessageEvent): void {
  if (e.source !== window.top || !isTeamsOrigin(e.origin)) return;
  const msg = (e.data as Record<string, unknown> | null)?.[TAG] as ToFrame | undefined;
  if (!msg || typeof msg !== 'object') return;
  if (msg.op.startsWith('inline-')) {
    onInline(msg);
    return;
  }
  switch (msg.op) {
    case 'hello':
      track();
      break;
    case 'blur':
      setBlur(msg.on, null);
      break;
    case 'cues':
      void answerCues(msg.id, msg.site, msg.uniqueId);
      break;
    case 'play': {
      const v = track();
      if (!v) return;
      v.play().then(
        () => send({ op: 'played', id: msg.id }),
        (err: DOMException) => send({ op: 'played', id: msg.id, error: err?.name === 'AbortError' ? undefined : err?.name || 'Error' }),
      );
      break;
    }
    case 'pause':
      track()?.pause();
      break;
    case 'seek': {
      const v = track();
      if (v && Number.isFinite(msg.t)) v.currentTime = Math.max(0, msg.t);
      break;
    }
    case 'rate': {
      if (!(msg.r > 0)) break;
      wantRate = msg.r;
      const v = track();
      if (v) v.playbackRate = msg.r;
      break;
    }
  }
}

if (window.top !== window && isTeamsOrigin(topOrigin)) {
  window.addEventListener('message', onMessage);
  send({ op: 'ready' });
  // The player can create its <video> after the frame loads.
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (track() || tries > 60) clearInterval(timer);
  }, 1000);
}
