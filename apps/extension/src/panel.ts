/**
 * The dictation panel. Lives in a shadow root so the host site's CSS cannot
 * reach it, and swallows its own key events so the site's player shortcuts
 * (space, k, m, f, arrows…) never fire while the learner types.
 *
 * Flow, as on WELE: play a segment, type what you heard, Enter to check,
 * Enter again to move on. Keys inside the box (WELE's defaults):
 *   1 play / pause the segment      2 back 2 s      3 forward 2 s
 *   Ctrl/⌘ + 1-3 types the digit    Enter check / next
 *   Alt+H hint    Alt+A show answer    Alt+← / Alt+→ previous / next    Alt+L loop
 */

import { setBlur } from './blur';
import { grade, hasWords, isSmallTalk, type Grade } from '@md/core';
import { buildSegments, mergeResults, parseSubtitleFile, transcriptFingerprint, type Segment } from '@md/core';
import { InlineBlanks, type LineState } from './inline';
import { WordBox } from './wordbox';
import { icon } from './icons';
import { entryLines, renderedLines, scrollTowardEntry } from './onetranscript';
import {
  cuesFromStream,
  detectSource,
  findVideo,
  isLoom,
  isStream,
  isTeams,
  isYouTube,
  openSiteTranscript,
  transcriptLines,
  visibleTranscriptRows,
  wakePlayer,
  type TranscriptLine,
  youTubeAdShowing,
  youTubeVideoId,
  type Source,
} from './sources';
import { accountEmail, onAuthChange, openConnect, pullProgress, pushProgress } from './sync';
import { actionFor, keyCaps, keys, loadKeys, onKeysChange, saveKeys, type KeyAction } from './keys';
import { mountCheckbox, mountSelect, mountSettings } from './ui';
import { RemoteInline, cuesFromTeams, teamsRecording } from './teams';

/**
 * YouTube enforces Trusted Types; a plain innerHTML assignment can throw there.
 * Everything we write is our own template or escaped text.
 */
let ttPolicy: { createHTML(s: string): unknown } | null | undefined;
function setHTML(el: Element | ShadowRoot, html: string): void {
  try {
    el.innerHTML = html;
  } catch {
    if (ttPolicy === undefined) {
      const tt = (window as unknown as { trustedTypes?: { createPolicy(n: string, p: object): { createHTML(s: string): unknown } } }).trustedTypes;
      try {
        ttPolicy = tt ? tt.createPolicy('meetingdictation', { createHTML: (s: string) => s }) : null;
      } catch {
        ttPolicy = null;
      }
    }
    if (!ttPolicy) throw new Error('MeetingDictation: this page blocks HTML injection');
    (el as { innerHTML: unknown }).innerHTML = ttPolicy.createHTML(html);
  }
}

interface Result {
  typed: string;
  score: number;
  passed: boolean;
  revealed: boolean;
}

interface Saved {
  fp: string;
  index: number;
  results: Record<number, Result>;
  rate: number;
  loop: boolean;
  blur: boolean;
}

const PAD_BEFORE = 0.15;
const PAD_AFTER = 0.35;
const SKIP_PREF = 'mdSkip';
const SIZE_PREF = 'mdPanelSize';
const SKIPS = [1, 2, 3, 5, 10];

async function skipPref(): Promise<number> {
  try {
    const v = Number((await chrome.storage.local.get(SKIP_PREF))[SKIP_PREF]);
    return SKIPS.includes(v) ? v : 2;
  } catch {
    return 2;
  }
}

// Typing inside the site's transcript is the default; unticked, the panel's word blanks are used.
const TYPE_IN_PREF = 'mdTypeInScript';
const RATIO_PREF = 'mdBlankRatio';
const RATIOS = [1, 0.75, 0.5, 0.25];

async function ratioPref(): Promise<number> {
  try {
    const v = Number((await chrome.storage.local.get(RATIO_PREF))[RATIO_PREF]);
    return RATIOS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

function setRatioPref(v: number): void {
  try {
    void chrome.storage.local.set({ [RATIO_PREF]: v });
  } catch {
    /* extension reloaded under the page */
  }
}

async function typeInPref(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(TYPE_IN_PREF);
    return r[TYPE_IN_PREF] !== false;
  } catch {
    return true;
  }
}

function setTypeInPref(on: boolean): void {
  try {
    void chrome.storage.local.set({ [TYPE_IN_PREF]: on });
  } catch {
    /* extension reloaded under the page */
  }
}

/** The site's transcript lines that have words in them (on Stream, the rows drawn right now). */
function typeableLines(): TranscriptLine[] {
  return (isStream() ? renderedLines() : transcriptLines()).filter((l) => hasWords(l.text));
}

/** Teams' transcript list (Stream page, Recap) is read from Stream's API, not the page. */
function isTeamsList(): boolean {
  return isStream() || isTeams();
}

const storage = {
  async get(key: string): Promise<Saved | null> {
    try {
      const r = await chrome.storage.local.get(key);
      return (r[key] as Saved) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: Saved): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch {
      /* extension reloaded under the page: progress for this session only */
    }
  },
};

function pageKey(): string {
  if (isYouTube()) {
    const id = youTubeVideoId();
    return `md:${location.host}${location.pathname}${id ? `?v=${id}` : ''}`;
  }
  // Teams shows every recording at the same URL; the file is its SharePoint id.
  const teams = teamsRecording();
  if (teams) return `md:teams:${teams.uniqueId}`;
  // Every Stream video is the same stream.aspx page; the file is its ?id=.
  const streamId = isStream() ? new URL(location.href).searchParams.get('id') : null;
  return `md:${location.host}${location.pathname}${streamId ? `?id=${streamId}` : ''}`;
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function pageTitle(): string {
  return (document.title || location.hostname).replace(/\s*[-|·]\s*(YouTube|Loom)\s*$/i, '').trim().slice(0, 300);
}

function siteName(): string {
  if (/(^|\.)loom\.com$/.test(location.hostname)) return 'loom';
  if (/(^|\.)youtube\.com$/.test(location.hostname)) return 'youtube';
  if (isStream()) return 'stream';
  if (isTeams()) return 'teams';
  return location.hostname.replace(/^www\./, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2333; }
.card { width: 420px; min-width: 320px; min-height: 180px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); display: flex; flex-direction: column; background: #fff; border: 1px solid #e3e5ee; border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 24, 50, .22); overflow: hidden; resize: both; }
.card > .body { flex: 1; min-height: 0; overflow-y: auto; }
.answer { border: 1px solid #e3e5ee; border-radius: 12px; padding: 12px; background: #fff; }
.answer:focus-within { border-color: #c7d2fe; }
.words { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 6px; font-size: 15px; }
.w-text { padding: 0 1px; color: #5d6276; }
.speaker { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 13px; font-weight: 600; color: #4f46e5; }
.speaker.hidden { display: none; }
.wrap:not(.typing) .meta .who { display: none; }
.w-slot { display: inline-flex; }
.w-row { display: inline-flex; align-items: center; color: #5d6276; }
.w-blank { all: unset; box-sizing: border-box; height: 32px; min-width: 2.4em; padding: 0 8px; font: inherit; font-size: 15px; line-height: 30px; color: #1f2333; text-align: center; background: #f4f5f9; border: 1px solid #e3e5ee; border-radius: 8px; transition: border-color .12s, box-shadow .12s, background .12s; }
.w-blank:hover { border-color: #c9cde0; }
.w-blank:focus { background: #fff; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.18); }
.w-blank.rev { color: #b45309; background: #fef7e6; border-color: #fbe3b4; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #4f46e5; color: #fff; cursor: move; user-select: none; }
header .title { font-weight: 700; }
header .src { opacity: .8; font-size: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
header button { background: rgba(255,255,255,.18); color: #fff; border: 0; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 15px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
header button.on { background: rgba(255,255,255,.34); }
.body { padding: 12px; display: grid; gap: 10px; }
.bar { height: 6px; background: #eef0f6; border-radius: 3px; overflow: hidden; }
.bar > div { height: 100%; background: #22c55e; width: 0; transition: width .3s; }
.meta { display: flex; justify-content: space-between; font-size: 12px; color: #5d6276; gap: 8px; }
.meta .who { font-weight: 600; color: #4f46e5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.controls { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
button.b { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid #d9dce8; background: #f7f8fc; color: #1f2333; border-radius: 8px; padding: 6px 9px; cursor: pointer; font: inherit; font-size: 13px; }
button.b:hover { background: #eef0f8; }
button.b.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; font-weight: 600; }
button.b.primary:hover { background: #4338ca; }
button.b.on { background: #e0e7ff; border-color: #a5b4fc; }
button.b:disabled { opacity: .45; cursor: default; }
button.sel { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d9dce8; border-radius: 8px; padding: 5px 8px 5px 10px; font: inherit; font-size: 13px; background: #fff; color: #1f2333; cursor: pointer; outline: none; }
button.sel:hover { background: #f7f8fc; }
button.sel:focus-visible, button.sel[data-state="open"] { border-color: #818cf8; box-shadow: 0 0 0 3px rgba(99, 102, 241, .18); }
.sel-icon { display: inline-flex; color: #7a7f93; }
.sel-menu { z-index: 2147483647; min-width: var(--radix-select-trigger-width); background: #fff; border: 1px solid #e3e5ee; border-radius: 10px; box-shadow: 0 10px 30px rgba(20, 24, 50, .18); padding: 4px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2333; }
.sel-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 8px; border-radius: 6px; cursor: pointer; outline: none; user-select: none; }
.sel-item[data-highlighted] { background: #eef0ff; color: #3730a3; }
.sel-item[data-state="checked"] { font-weight: 600; }
.sel-tick { display: inline-flex; color: #4f46e5; }
.check { display: inline-flex; align-items: center; gap: 7px; }
.check label { cursor: grab; touch-action: none; user-select: none; }
button.check-box { all: unset; box-sizing: border-box; width: 16px; height: 16px; border: 1.5px solid #b9bdd0; border-radius: 4px; background: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
button.check-box:focus-visible { box-shadow: 0 0 0 3px rgba(99, 102, 241, .25); }
button.check-box[data-state="checked"] { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.check-tick { display: inline-flex; }
.settings { display: grid; gap: 10px; }
.settings-head { display: flex; align-items: center; justify-content: space-between; }
.settings-note { margin: 0; font-size: 12px; color: #5d6276; }
.keylist { display: grid; gap: 2px; }
.keyrow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 10px; padding: 5px 2px; border-bottom: 1px solid #f0f1f6; font-size: 13px; }
.keyrow.fixed { color: #7a7f93; }
button.keybtn { min-width: 96px; display: inline-flex; justify-content: center; align-items: center; gap: 2px; border: 1px solid #d9dce8; border-radius: 8px; padding: 4px 8px; background: #f7f8fc; font: inherit; font-size: 12px; color: #1f2333; cursor: pointer; outline: none; }
button.keybtn:hover { background: #eef0f8; }
button.keybtn.listening { border-color: #6366f1; background: #eef0ff; color: #4338ca; box-shadow: 0 0 0 3px rgba(99, 102, 241, .18); }
.keyfixed { min-width: 96px; text-align: center; }
.keyerr { grid-column: 1 / -1; font-size: 12px; color: #c2410c; }
.plus { margin: 0 2px; color: #9aa0b4; }
.play { min-width: 92px; }
textarea { width: 100%; min-height: 76px; resize: vertical; border: 2px solid #d9dce8; border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 15px; color: #1f2333; background: #fff; outline: none; }
textarea:focus { border-color: #818cf8; }
textarea.pass { border-color: #22c55e; }
.result { min-height: 24px; font-size: 15px; line-height: 1.9; word-wrap: break-word; }
.result .ok { color: #15803d; }
.result .gap { color: #9aa0b4; letter-spacing: 1px; }
.result .part { color: #c2410c; letter-spacing: 1px; }
.result .ans { color: #b91c1c; font-weight: 600; text-decoration: underline dotted; }
.result .wrong { color: #dc2626; text-decoration: line-through; opacity: .85; margin-right: 2px; }
.result .fill { color: #b5b9c9; font-style: italic; }
.verdict { font-size: 13px; font-weight: 600; }
.verdict.good { color: #15803d; }
.verdict.bad { color: #c2410c; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.actions .spacer { flex: 1; }
footer { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 8px 12px; border-top: 1px solid #eef0f6; font-size: 12px; color: #5d6276; flex-wrap: wrap; }
footer label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
footer a { color: #4f46e5; cursor: pointer; text-decoration: none; }
footer a:hover { text-decoration: underline; }
footer .acct { flex-basis: 100%; display: flex; align-items: center; gap: 6px; }
footer .acct b { color: #15803d; font-weight: 600; }
.keys { font-size: 11.5px; color: #7a7f93; }
.keygrid { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 5px 8px; margin: 8px 0 0; font-size: 12px; align-items: center; }
.keygrid dt { white-space: nowrap; text-align: right; }
.keygrid dd { margin: 0; color: #7a7f93; }
kbd { font: 11px ui-monospace, monospace; background: #f1f2f7; border: 1px solid #dfe1ea; border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; }
.pill { display: flex; align-items: center; gap: 8px; background: #4f46e5; color: #fff; border: 0; border-radius: 999px; padding: 9px 14px; font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 6px 20px rgba(20,24,50,.25); cursor: pointer; }
.msg { padding: 6px 2px; color: #5d6276; }
.msg strong { color: #1f2333; }
.hidden { display: none !important; }
.body.in-settings > :not([data-ref="settings"]) { display: none !important; }
.keys a { color: #4f46e5; cursor: pointer; }
.wrap.typing { right: auto; left: 20px; }
.wrap.typing .keys, .wrap.typing [data-act="check"], .wrap.typing .result, .wrap.typing textarea { display: none; }
@media (prefers-color-scheme: dark) {
  .wrap { color: #e7e9f3; }
  .card { background: #1c1e29; border-color: #2f3242; }
  .bar { background: #2a2d3b; }
  .meta, footer, .msg, .keys { color: #a3a8bd; }
  .msg strong { color: #e7e9f3; }
  button.b { background: #262938; border-color: #393d50; color: #e7e9f3; }
  button.b:hover { background: #2f3345; }
  button.b.on { background: #312e81; border-color: #6366f1; }
  textarea, button.sel, button.keybtn { background: #151720; border-color: #393d50; color: #e7e9f3; }
  .answer { background: #151720; border-color: #393d50; }
  .w-blank { background: #1c1e29; border-color: #2f3242; color: #e7e9f3; }
  .w-blank:focus { background: #151720; border-color: #818cf8; }
  .w-blank.rev { background: #33270f; border-color: #5c4516; color: #fbbf24; }
  .w-text, .w-row { color: #9aa0b4; }   button.sel:hover, button.keybtn:hover { background: #1f2230; }
  .sel-menu { background: #1c1e29; border-color: #2f3242; color: #e7e9f3; }
  .sel-item[data-highlighted] { background: #312e81; color: #e0e7ff; }
  button.check-box { background: #151720; border-color: #4b4f66; }
  .keyrow { border-color: #2a2d3b; }
  .settings-note { color: #a3a8bd; }
  button.keybtn.listening { background: #312e81; color: #e0e7ff; }
  footer { border-color: #2a2d3b; }
  kbd { background: #262938; border-color: #393d50; color: #e7e9f3; }
  .result .ok { color: #4ade80; } .result .ans { color: #f87171; } .result .wrong { color: #f87171; }
  .result .gap, .result .fill { color: #6b7087; }
}
`;

const MARK = '<svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true" style="flex:none"><rect width="64" height="64" rx="16" fill="#3730A3"/><path d="M15 15h34a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H31l-10 8.5V45h-6a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7z" fill="#FFFCF5"/><rect x="16" y="26" width="4" height="8" rx="2" fill="#4F46E5"/><rect x="23" y="21" width="4" height="18" rx="2" fill="#4F46E5"/><rect x="30" y="24.5" width="4" height="11" rx="2" fill="#4F46E5"/><rect x="40" y="20" width="3.5" height="20" rx="1.75" fill="#14181F"/><circle cx="50" cy="15" r="6.5" fill="#F2C744" stroke="#3730A3" stroke-width="2.5"/></svg>';

const TEMPLATE = `
<div class="wrap">
  <button class="pill hidden" data-ref="pill">${MARK}<span data-ref="pillText">Dictation</span></button>
  <div class="card" data-ref="card">
    <header data-ref="head">
      ${MARK}<span class="title">MeetingDictation</span>
      <span class="src" data-ref="src"></span>
      <button data-act="settings" title="Shortcut keys" data-ref="gear">${icon.cog(15)}</button>
      <button data-act="collapse" title="Minimise">${icon.minus(15)}</button>
      <button data-act="close" title="Close and un-blur">${icon.close(15)}</button>
    </header>
    <div class="body" data-ref="body">
      <div data-ref="settings" class="hidden"></div>
      <div data-ref="status" class="msg">Looking for the transcript…</div>
      <div data-ref="main" class="hidden" style="display:grid;gap:10px">
        <div class="bar"><div data-ref="bar"></div></div>
        <div class="meta"><span data-ref="pos"></span><span class="who" data-ref="who"></span><span data-ref="stats"></span></div>
        <div class="controls">
          <button class="b" data-act="prev" title="Previous segment (Alt+←)">${icon.backward()}</button>
          <button class="b primary play" data-act="play" title="Play / pause segment (1)">${icon.play()}<span>Play</span></button>
          <button class="b" data-act="back" title="Back 2 s (2)">−2s</button>
          <button class="b" data-act="fwd" title="Forward 2 s (3)">+2s</button>
          <button class="b" data-act="next" title="Next segment (Alt+→)">${icon.forward()}</button>
          <button class="b" data-act="loop" title="Loop segment (Alt+L)">${icon.loop()}</button>
          <span data-ref="ratio" class="hidden"></span>
          <span data-ref="rate"></span>
          <span data-ref="skip"></span>
        </div>
        <div class="msg hidden" data-ref="typeHelp">Type in the blanks in the transcript.
          <dl class="keygrid" data-ref="keygrid"></dl>
        </div>
        <div class="answer" data-ref="input"><div class="speaker" data-ref="speaker">${icon.user(16)}<span data-ref="speakerName"></span></div></div>
        <div class="verdict bad hidden" data-ref="note"></div>
        <div class="verdict" data-ref="verdict"></div>
        <div class="result" data-ref="result"></div>
        <div class="actions">
          <button class="b primary" data-act="check">${icon.check()}<span>Check</span></button>
          <button class="b" data-act="hint" title="Alt+H">Hint</button>
          <button class="b" data-act="answer" title="Alt+A">Show answer</button>
          <span class="spacer"></span>
          <button class="b" data-act="here" title="Go to the segment at the video's current time">${icon.here()}<span>Here</span></button>
        </div>
        <div class="keys" data-ref="keyline"></div>
      </div>
    </div>
    <footer>
      <span data-ref="blur"></span>
      <span class="hidden" data-ref="typeInWrap"></span>
      <span><a data-act="load">Load .vtt / .srt</a> · <a data-act="reset">Restart</a></span>
      <span class="acct" data-ref="acct"></span>
      <input type="file" data-ref="file" accept=".vtt,.srt,.txt,text/vtt" class="hidden">
    </footer>
  </div>
</div>
`;

export class DictationPanel {
  private host: HTMLElement;
  private root: ShadowRoot;
  private refs: Record<string, HTMLElement> = {};
  private video: HTMLVideoElement | null = null;
  private segments: Segment[] = [];
  private index = 0;
  private results: Record<number, Result> = {};
  private loop = false;
  private rate = 1;
  private blur = true;
  private rateSel!: ReturnType<typeof mountSelect>;
  private skipSel!: ReturnType<typeof mountSelect>;
  private skip = 2;
  private ratioSel!: ReturnType<typeof mountSelect>;
  private blurBox!: ReturnType<typeof mountCheckbox>;
  private typeInBox!: ReturnType<typeof mountCheckbox>;
  private settings: ReturnType<typeof mountSettings> | null = null;
  private key = pageKey();
  private stopAt: number | null = null;
  private raf = 0;
  private loopTimer = 0;
  private started = false;
  private played = 0;
  private lastTick = 0;
  private pushTimer = 0;
  private email: string | null = null;
  private source: Source | null = null;
  /** Typing straight into the site's transcript lines instead of the box. */
  private typing = false;
  private typeIn = true;
  /** One blank per word of the current sentence (when not typing in the site's transcript). */
  private box = new WordBox({
    key: (action) => this.runKey(action),
    check: () => this.check(),
    changed: () => {},
  });
  private lines: TranscriptLine[] = [];
  private playerWoken = false;
  private inline: InlineBlanks | RemoteInline;
  private blankHost = (): ConstructorParameters<typeof InlineBlanks>[0] => ({
      select: (i) => {
        if (i !== this.index) this.seekLine(i);
      },
      seek: (i) => this.seekLine(i),
      check: (i) => {
        if (i !== this.index) this.show(i, false);
        this.check();
        this.focus();
      },
      key: (action) => this.runKey(action),
  });

  constructor() {
    // On Recap the transcript is in a SharePoint frame: the blanks are made there (frame.ts).
    this.inline = isTeams()
      ? new RemoteInline(this.blankHost(), (i) => this.lineState(i))
      : new InlineBlanks(this.blankHost(), (i) => this.lineState(i), typeableLines, (line) => scrollTowardEntry(line.id));
    this.host = document.createElement('meeting-dictation');
    this.root = this.host.attachShadow({ mode: 'open' });
    setHTML(this.root, `<style>${STYLE}</style>${TEMPLATE}`);
    this.root.querySelectorAll<HTMLElement>('[data-ref]').forEach((el) => (this.refs[el.dataset.ref!] = el));
    document.documentElement.appendChild(this.host);

    // Keep every key inside the panel: the page's player must not see them.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      this.host.addEventListener(type, (e) => e.stopPropagation());
    }
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) this.act(act);
    });
    this.refs.pill.addEventListener('click', () => {
      if (!this.pillDragged) this.open();
    });
    // The keys work wherever the focus is, not only in a blank: clicking the video moves
    // focus to the page, and the site's player would take 1/2/3 (YouTube jumps to 10/20/30%).
    window.addEventListener('keydown', (e) => this.onPageKey(e), true);
    this.refs.input.append(this.box.el);
    const portal = this.root.querySelector<HTMLElement>('.wrap')!;
    this.rateSel = mountSelect(this.refs.rate, portal, {
      title: 'Speed',
      value: '1',
      options: ['0.5', '0.75', '0.9', '1', '1.25'].map((v) => ({ value: v, label: `${v}×` })),
      onChange: (v) => {
        this.rate = Number(v);
        // On Teams the player in Recap's frame may not have reported in before the first play.
        this.video = this.video ?? findVideo();
        if (this.video) this.video.playbackRate = this.rate;
        void this.save();
        this.focus();
      },
    });
    this.skipSel = mountSelect(this.refs.skip, portal, {
      title: 'How far −/+ skip',
      value: '2',
      options: SKIPS.map((v) => ({ value: String(v), label: `±${v}s` })),
      onChange: (v) => {
        this.skip = Number(v);
        try {
          void chrome.storage.local.set({ [SKIP_PREF]: this.skip });
        } catch {
          /* extension reloaded under the page */
        }
        this.drawKeyHelp();
        this.focus();
      },
    });
    void skipPref().then((v) => {
      this.skip = v;
      this.skipSel.set(String(v));
      this.drawKeyHelp();
    });
    this.ratioSel = mountSelect(this.refs.ratio, portal, {
      title: 'How many words are blanks',
      value: '1',
      options: RATIOS.map((v) => ({ value: String(v), label: `Blanks ${v * 100}%` })),
      onChange: (v) => {
        setRatioPref(Number(v));
        this.inline.setRatio(Number(v));
        if (this.typing) this.lineVerdict(this.results[this.index]);
        this.focus();
      },
    });
    this.blurBox = mountCheckbox(this.refs.blur, {
      label: 'Blur transcript & captions',
      checked: true,
      onChange: (on) => {
        this.blur = on;
        setBlur(this.blur, this.video);
        void this.save();
      },
    });
    this.typeInBox = mountCheckbox(this.refs.typeInWrap, {
      label: 'Type in the transcript',
      title: 'Turn the transcript next to the video into blanks you type in',
      checked: true,
      onChange: (on) => void this.switchTypeIn(on),
    });
    this.refs.file.addEventListener('change', () => void this.loadFile());
    this.drawKeyHelp();
    onKeysChange(() => {
      this.drawKeyHelp();
      this.settings?.set(keys());
    });
    void loadKeys();
    this.makeDraggable();
    this.makePillDraggable();
    this.makeResizable();
    // A smaller window must not leave the panel (or the pill) off screen.
    window.addEventListener('resize', () => requestAnimationFrame(() => this.keepOnScreen()));
    void this.refreshAccount();
    onAuthChange(() => {
      void this.refreshAccount().then(() => this.schedulePush(0));
    });
  }

  private async refreshAccount(): Promise<void> {
    this.email = await accountEmail();
    setHTML(
      this.refs.acct,
      this.email
        ? `${icon.cloud(14)}<span>Synced to <b>${esc(this.email)}</b></span>`
        : `${icon.cloud(14)}<span><a data-act="connect">Sign in to MeetingDictation</a> to save progress & streak</span>`,
    );
  }

  get isOpen(): boolean {
    return this.host.isConnected && !this.refs.card.classList.contains('hidden');
  }

  // ------------------------------------------------------------ lifecycle

  private get progressKey(): string {
    return this.typing ? `${this.key}#blanks` : this.key;
  }

  private lineState(i: number): LineState | undefined {
    const r = this.results[i];
    return r ? { typed: r.typed, revealed: r.revealed, checked: true } : undefined;
  }

  async start(): Promise<void> {
    this.video = findVideo();
    setBlur(this.blur, this.video);
    this.status('Looking for the transcript…');
    this.typeIn = await typeInPref();
    const hasList = isLoom() || isYouTube() || isTeamsList();
    this.refs.typeInWrap.classList.toggle('hidden', !hasList);
    this.typeInBox.set(this.typeIn);
    if (hasList && this.typeIn && (await this.startTyping())) return;
    // On Recap, typing failed only because the transcript could not be read: asking again takes as long.
    const source = isTeams() && this.typeIn ? null : await detectSource(this.video);
    if (!source && isTeams()) {
      this.status(
        teamsRecording()
          ? '<strong>Couldn\'t read this recording\'s transcript.</strong><br>If you just installed or reloaded MeetingDictation, reload this Teams tab so it can reach the recording, then open the panel again. A recording without a transcript can\'t be practised.'
          : '<strong>Open a meeting recording.</strong><br>In the meeting\'s chat, open <strong>Recap</strong>, then start dictation again.',
      );
      return;
    }
    if (!source) {
      this.status(
        '<strong>No captions found on this page.</strong><br>Download the recording\'s transcript (.vtt / .srt — Zoom, Teams, Meet and Drive all offer one) and choose <a data-act="load" style="color:#4f46e5;cursor:pointer">Load .vtt / .srt</a>.',
      );
      return;
    }
    await this.useSource(source);
  }

  /** Turn the site's own transcript lines into blanks. False when the page has none. */
  private async startTyping(): Promise<boolean> {
    if (isTeamsList()) return this.startTypingTeams();
    if (!typeableLines().length) await openSiteTranscript();
    const lines = typeableLines();
    if (!lines.length) return false;
    const duration = this.video && Number.isFinite(this.video.duration) && !youTubeAdShowing() ? this.video.duration : 0;
    this.lines = lines;
    this.typing = true;
    this.segments = lines.map((l, i) => ({
      start: l.start,
      end: Math.max(l.start + 0.5, lines[i + 1]?.start ?? (duration > l.start ? duration : l.start + 10)),
      text: l.text,
      speaker: l.speaker,
    }));
    this.results = {};
    this.index = 0;
    await this.begin(`${isLoom() ? 'Loom' : 'YouTube'} transcript · ${lines.length} lines`);
    return true;
  }

  /** Teams: every line of the transcript from Stream's API; the list draws only the rows on screen. */
  private async startTypingTeams(): Promise<boolean> {
    const found = isTeams() ? await cuesFromTeams().catch(() => null) : await cuesFromStream().catch(() => null);
    if (!found) return false;
    const entries = found.cues.map((c, k) => ({ id: found.ids[k], ...c })).filter((e) => hasWords(e.text));
    if (!entries.length) return false;
    // On Recap the rows are in another frame: these lines only carry the words and ids.
    this.lines = isTeams()
      ? entries.map((e) => ({ el: document.createElement('span'), id: e.id, start: e.start, end: e.end, text: e.text, speaker: e.speaker, speakerShown: false }))
      : entryLines(entries);
    this.typing = true;
    this.segments = this.lines.map((l, i) => ({
      start: l.start,
      end: Math.max(l.start + 0.5, l.end ?? this.lines[i + 1]?.start ?? l.start + 10),
      text: l.text,
      speaker: l.speaker,
    }));
    this.results = {};
    this.index = 0;
    await this.begin(`${found.label} · ${this.lines.length} lines`);
    return true;
  }

  private async switchTypeIn(on: boolean): Promise<void> {
    this.typeIn = on;
    setTypeInPref(on);
    this.stopLoop();
    if (on) {
      if (await this.startTyping()) return;
      this.typeIn = false;
      this.typeInBox.set(false);
      this.note('This page has no transcript list to type in.');
      return;
    }
    this.inline.detach();
    this.typing = false;
    const source = this.source ?? (await detectSource(this.video));
    if (source) await this.useSource(source);
    else this.status('<strong>No captions found on this page.</strong>');
  }

  /** In-site navigation to another video (YouTube): start over for the new page. */
  async restartForNewPage(): Promise<void> {
    if (!this.started) return;
    this.stopLoop();
    this.inline.detach();
    this.typing = false;
    this.source = null;
    this.key = pageKey();
    this.segments = [];
    this.results = {};
    this.index = 0;
    await this.start();
  }

  private async useSource(source: Source): Promise<void> {
    this.source = source;
    this.inline.detach();
    this.typing = false;
    this.segments = buildSegments(source.cues).filter((s) => hasWords(s.text) && !isSmallTalk(s.text));
    if (!this.segments.length) {
      this.status('<strong>The transcript is empty.</strong>');
      return;
    }
    this.results = {};
    await this.begin(`${source.label} · ${this.segments.length} segments`);
  }

  /** Segments are set: load saved progress and show the first one. */
  private async begin(label: string): Promise<void> {
    this.refs.src.textContent = label;
    const fp = transcriptFingerprint(this.segments);
    const [saved, remote] = await Promise.all([storage.get(this.progressKey), pullProgress(this.progressKey)]);
    if (saved && saved.fp === fp) {
      this.index = Math.min(saved.index, this.segments.length - 1);
      this.results = saved.results ?? {};
      this.rate = saved.rate ?? 1;
      this.loop = !!saved.loop;
      this.blur = saved.blur ?? true;
    }
    if (remote && remote.fp === fp) {
      // Practised on another device too: keep the better answer for every sentence.
      this.results = mergeResults(this.results, remote.results);
      if (!saved || saved.fp !== fp) this.index = Math.min(remote.index, this.segments.length - 1);
    }
    this.index = this.practiceFrom(this.index, 1);
    this.rateSel.set(String(this.rate));
    this.blurBox.set(this.blur);
    setBlur(this.blur, this.video);
    this.refs.status.classList.add('hidden');
    this.refs.main.classList.remove('hidden');
    this.refs.input.classList.toggle('hidden', this.typing);
    this.refs.result.classList.toggle('hidden', this.typing);
    this.refs.typeHelp.classList.toggle('hidden', !this.typing);
    this.root.querySelector('.wrap')!.classList.toggle('typing', this.typing);
    this.refs.ratio.classList.toggle('hidden', !this.typing);
    if (this.typing) {
      const ratio = await ratioPref();
      this.ratioSel.set(String(ratio));
      this.inline.setRatio(ratio);
    }
    if (this.typing) this.inline.attach(this.lines);
    this.show(this.index);
    this.startWatching();
    this.revealRows();
    this.focus();
  }

  private async loadFile(): Promise<void> {
    const input = this.refs.file as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const cues = parseSubtitleFile(await file.text());
    if (!cues.length) {
      this.status('<strong>That file has no timed lines.</strong> Use a .vtt or .srt file.');
      return;
    }
    this.video = this.video ?? findVideo();
    this.results = {};
    this.index = 0;
    await this.useSource({ kind: 'file', label: file.name, cues });
    void this.save();
  }

  /** Open the panel; the first open finds the transcript and blurs the page. */
  open(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.collapse(false);
    if (!this.started) {
      this.started = true;
      void this.start();
    } else {
      setBlur(this.blur, this.video);
      if (this.segments.length) this.startWatching();
      if (this.typing && !this.inline.attached) {
        if (isStream()) this.lines = entryLines(this.lines.map((l) => ({ id: l.id ?? '', start: l.start, end: l.end ?? l.start, text: l.text, speaker: l.speaker })));
        else if (!isTeams()) this.lines = typeableLines();
        this.inline.attach(this.lines);
        this.inline.setCurrent(this.index, true);
      }
    }
  }

  close(): void {
    this.stopLoop();
    clearInterval(this.watching);
    this.inline.detach();
    setBlur(false, this.video);
    this.host.remove();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Just the small pill, nothing blurred yet (auto-run on Loom / YouTube). */
  showPill(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.collapse(true);
  }

  get isStarted(): boolean {
    return this.started;
  }

  collapse(on: boolean): void {
    this.refs.card.classList.toggle('hidden', on);
    this.refs.pill.classList.toggle('hidden', !on);
    if (!on) requestAnimationFrame(() => this.keepOnScreen());
    if (!on) this.focus();
  }

  // ------------------------------------------------------------ segment view

  private show(i: number, scroll = true): void {
    this.stopLoop();
    this.index = Math.max(0, Math.min(i, this.segments.length - 1));
    const seg = this.segments[this.index];
    const r = this.results[this.index];
    if (this.typing) {
      this.inline.setCurrent(this.index, scroll);
      this.lineVerdict(r);
      this.refs.pos.textContent = `Line ${this.index + 1} / ${this.segments.length} · ${fmt(seg.start)}`;
      this.refs.who.textContent = seg.speaker ?? '';
      this.updateStats();
      void this.save();
      return;
    }
    this.box.setSentence(seg.text, r?.typed ?? '');
    this.refs.result.textContent = '';
    this.refs.verdict.textContent = '';
    this.refs.verdict.className = 'verdict';
    if (r) this.renderGrade(grade(seg.text, r.typed), true, r.score, r.revealed && !r.passed && r.score === 0);
    this.refs.pos.textContent = `Segment ${this.index + 1} / ${this.segments.length} · ${fmt(seg.start)}`;
    this.refs.who.textContent = seg.speaker ?? '';
    this.refs.speakerName.textContent = seg.speaker ?? '';
    this.refs.speaker.classList.toggle('hidden', !seg.speaker);
    this.updateStats();
    void this.save();
  }

  /** Greetings and small talk stay on screen as they are and are skipped (Teams, Loom, YouTube lines). */
  private skips(i: number): boolean {
    return !!this.segments[i] && isSmallTalk(this.segments[i].text);
  }

  /** The nearest line from i in direction dir worth practising; i itself if there is none. */
  private practiceFrom(i: number, dir: 1 | -1): number {
    for (let k = i; k >= 0 && k < this.segments.length; k += dir) if (!this.skips(k)) return k;
    return i;
  }

  private updateStats(): void {
    const practised = this.segments.map((_, i) => i).filter((i) => !this.skips(i));
    const total = practised.length || 1;
    const done = practised.filter((i) => this.results[i]?.passed || this.results[i]?.revealed).length;
    const scored = practised.map((i) => this.results[i]).filter(Boolean);
    const avg = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 100) : 0;
    const pct = Math.round((done / total) * 100);
    (this.refs.bar as HTMLElement).style.width = `${pct}%`;
    this.refs.stats.textContent = scored.length ? `${pct}% done · ~${avg}% right` : `${pct}% done`;
    this.refs.pillText.textContent = `Dictation ${this.index + 1}/${this.segments.length}`;
  }

  /**
   * The sentence after a check: every word, with right ones green, missed ones red and wrong
   * typing crossed out. score counts words shown by a hint as mistakes; answerOnly is Show answer.
   */
  private renderGrade(g: Grade, revealed: boolean, score = g.score, answerOnly = false): void {
    const parts: string[] = [];
    for (const w of g.words) {
      for (const wrong of w.wrongBefore) parts.push(`<span class="wrong">${esc(wrong)}</span>`);
      if (w.state === 'correct') parts.push(`<span class="ok">${esc(w.raw)}</span>`);
      else if (w.state === 'filler') parts.push(`<span class="fill">${esc(w.raw)}</span>`);
      else if (revealed) parts.push(`<span class="ans">${esc(w.raw)}</span>`);
      else {
        const mask = w.raw.replace(/[\p{L}\p{N}]/gu, '*');
        parts.push(`<span class="${w.state === 'partial' ? 'part' : 'gap'}">${esc(mask)}</span>`);
      }
    }
    for (const wrong of g.trailingWrong) parts.push(`<span class="wrong">${esc(wrong)}</span>`);
    setHTML(this.refs.result, parts.join(' '));
    const v = this.refs.verdict;
    if (g.passed && score >= 0.999) {
      v.textContent = 'Perfect! Enter for the next sentence';
      v.className = 'verdict good';
    } else if (answerOnly) {
      v.textContent = 'Answer shown. Enter for the next sentence';
      v.className = 'verdict bad';
    } else if (revealed) {
      v.textContent = `${Math.round(score * 100)}% right · Enter for the next sentence`;
      v.className = g.passed ? 'verdict good' : 'verdict bad';
    } else {
      const missing = g.words.filter((w) => w.state === 'missing' || w.state === 'partial').length;
      v.textContent = `${Math.round(score * 100)}% · ${missing} word${missing === 1 ? '' : 's'} to fix`;
      v.className = 'verdict bad';
    }
  }

  private lineVerdict(r?: Result): void {
    const v = this.refs.verdict;
    if (!r) {
      v.textContent = '';
      v.className = 'verdict';
    } else if (r.passed) {
      v.textContent = 'Perfect! Enter for the next line';
      v.className = 'verdict good';
    } else if (r.revealed) {
      v.textContent = `${Math.round(r.score * 100)}% right · Enter for the next line`;
      v.className = 'verdict bad';
    } else {
      const { wrong, score } = this.inline.grade(this.index);
      v.textContent = `${Math.round(score * 100)}% · ${wrong} word${wrong === 1 ? '' : 's'} to fix`;
      v.className = 'verdict bad';
    }
  }

  private checkLine(): void {
    const i = this.index;
    const typed = this.inline.typed(i);
    const prev = this.results[i];
    if (prev?.revealed || (prev?.passed && typed === prev.typed)) {
      this.next();
      return;
    }
    if (this.inline.isEmpty(i)) {
      this.playSegment(true);
      return;
    }
    const g = this.inline.grade(i);
    // One submission per line: the sentence is shown after it, so a miss counts as seen (and done).
    this.results[i] = { typed, score: Math.max(prev?.score ?? 0, g.score), passed: g.passed, revealed: !g.passed };
    this.inline.paint(i);
    this.inline.focus(i);
    this.lineVerdict(this.results[i]);
    this.updateStats();
    void this.save();
  }

  private check(): void {
    if (this.typing) {
      this.checkLine();
      return;
    }
    const seg = this.segments[this.index];
    const typed = this.box.value;
    const prev = this.results[this.index];
    // Checked already and nothing changed: the sentence is on screen, so Enter moves on.
    if (prev && typed === prev.typed) {
      this.next();
      return;
    }
    if (this.box.isEmpty) {
      this.playSegment(true);
      return;
    }
    const g = grade(seg.text, typed);
    const revealed = !!prev?.revealed;
    // Words shown by a hint count as mistakes.
    const honest = this.box.revealedCount ? grade(seg.text, this.box.honestValue).score : g.score;
    this.results[this.index] = {
      typed,
      // first honest attempt sets the score; typing a revealed answer does not raise it
      score: revealed ? prev.score : Math.max(prev?.score ?? 0, honest),
      passed: g.passed,
      // The whole sentence is shown after a check, so a miss counts as seen (and done).
      revealed: revealed || !g.passed,
    };
    this.renderGrade(g, true, revealed ? prev.score : honest);
    this.updateStats();
    this.revealRows();
    void this.save();
  }

  private giveHint(): void {
    if (this.typing) {
      this.inline.hint(this.index);
      return;
    }
    this.box.hint();
  }

  private showAnswer(): void {
    if (this.typing) {
      const i = this.index;
      const typed = this.inline.typed(i);
      const g = this.inline.grade(i);
      const prev = this.results[i];
      this.results[i] = { typed, score: prev?.score ?? g.score, passed: g.passed, revealed: true };
      this.inline.paint(i);
      this.lineVerdict(this.results[i]);
      this.updateStats();
      void this.save();
      return;
    }
    const seg = this.segments[this.index];
    const g = grade(seg.text, this.box.honestValue);
    const prev = this.results[this.index];
    this.box.revealAll();
    this.results[this.index] = { typed: this.box.value, score: prev?.score ?? g.score, passed: g.passed, revealed: true };
    this.renderGrade(g, true, prev?.score ?? g.score, true);
    this.updateStats();
    this.revealRows();
    void this.save();
    this.focus();
  }

  private next(): void {
    const to = this.practiceFrom(this.index + 1, 1);
    if (to > this.index && to < this.segments.length && !this.skips(to)) {
      this.show(to);
      this.playSegment(true);
    } else {
      this.refs.verdict.textContent = 'You reached the end of the recording.';
      this.refs.verdict.className = 'verdict good';
    }
  }

  private prev(): void {
    const to = this.practiceFrom(this.index - 1, -1);
    if (to >= 0 && to < this.index && !this.skips(to)) {
      this.show(to);
      this.playSegment(true);
    }
  }

  private goToVideoTime(): void {
    const t = this.video?.currentTime ?? 0;
    let i = this.segments.findIndex((s) => s.end > t);
    if (i < 0) i = this.segments.length - 1;
    this.show(i);
    this.focus();
  }

  /** Un-blur the site's transcript rows whose segments are all finished. */
  private revealRows(): void {
    if (this.typing) return;
    const rows = visibleTranscriptRows();
    rows.forEach((row, i) => {
      const end = rows[i + 1]?.start ?? Number.POSITIVE_INFINITY;
      const inRow = this.segments
        .map((s, k) => ({ s, k }))
        .filter(({ s }) => s.start >= row.start - 0.6 && s.start < end - 0.6);
      // A greeting is never asked for, so it shows from the start.
      const done = isSmallTalk(row.text) || (inRow.length > 0 && inRow.every(({ k }) => this.results[k]?.passed || this.results[k]?.revealed));
      row.el.classList.toggle('md-done', done);
    });
  }

  // ------------------------------------------------------------ playback

  /** The line the learner skipped away from with −/+: play from there, not from the line's own time. */
  private movedOn = -1;

  private playSegment(fromStart: boolean): void {
    // Look again on every play: the panel may have opened before the page created its real
    // player (Loom adds the recording after its preview), and the first pick would be the preview.
    const found = findVideo();
    if (found && found !== this.video) {
      this.video = found;
      found.playbackRate = this.rate;
      setBlur(this.blur, found);
    }
    const v = this.video;
    if (!v && isTeams() && this.segments.length) {
      this.note('The Teams player isn\'t reachable yet. Press play on the video once, or reload the Teams tab.');
      return;
    }
    if (!v || !this.segments.length) return;
    if (isYouTube() && youTubeAdShowing()) {
      this.note('An ad is playing. Press 1 again when the video starts.');
      return;
    }
    if (!this.playerWoken) {
      this.playerWoken = true;
      void wakePlayer(v).then(() => this.playSegment(fromStart));
      return;
    }
    const seg = this.segments[this.index];
    // A transcript's times can be off: after −/+ the learner decides where the line is, so keep their spot.
    const moved = !fromStart && this.movedOn === this.index && !v.ended;
    if (!moved) this.movedOn = -1;
    const stop = moved ? Math.max(seg.end + PAD_AFTER, v.currentTime + 3) : seg.end + PAD_AFTER;
    const outside = v.currentTime < seg.start - PAD_BEFORE - 0.05 || v.currentTime >= stop - 0.05;
    if (!moved && (fromStart || outside || v.ended)) v.currentTime = Math.max(0, seg.start - PAD_BEFORE);
    v.playbackRate = this.rate;
    // The video plays on past the line; only Loop stops (and repeats) it at the line's end.
    this.stopAt = this.loop ? stop : null;
    void v.play().catch((err: DOMException) => {
      // AbortError is just a newer seek/pause winning; only a blocked autoplay needs the learner.
      if (err?.name === 'NotAllowedError') this.note('Click the video once so the page allows playback, then press 1 again.');
    });
    this.note('');
    this.watch();
    this.setPlayLabel(true);
  }

  private togglePlay(): void {
    const v = this.video;
    if (v && !v.paused) {
      v.pause();
      this.stopLoop();
    } else this.playSegment(false);
  }

  /** Make line i current and move the video to its start; keep playing if it was. */
  private seekLine(i: number): void {
    if (!this.segments[i]) return;
    // On Teams the panel only learns of the player in Recap's frame once it reports in.
    const v = (this.video = this.video ?? findVideo());
    const playing = !!v && !v.paused;
    if (i !== this.index) this.show(i, false);
    else this.stopLoop();
    if (playing) this.playSegment(true);
    else if (v) v.currentTime = Math.max(0, this.segments[i].start - PAD_BEFORE);
  }

  private nudge(delta: number): void {
    const v = this.video;
    if (!v || !this.segments.length) return;
    // No limit to the line's own times (they can be wrong); only the start and end of the video.
    const end = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), end);
    this.movedOn = this.index;
    this.playSegment(false);
  }

  private watch(): void {
    cancelAnimationFrame(this.raf);
    this.lastTick = performance.now();
    const tick = () => {
      const v = this.video;
      if (!v) return;
      const now = performance.now();
      if (!v.paused) this.played += Math.min(1, (now - this.lastTick) / 1000);
      this.lastTick = now;
      this.followPlayback();
      if (this.stopAt !== null && v.currentTime >= this.stopAt) {
        v.pause();
        this.setPlayLabel(false);
        if (this.loop) {
          clearTimeout(this.loopTimer);
          this.loopTimer = window.setTimeout(() => this.playSegment(true), 700);
        } else this.stopAt = null;
        return;
      }
      if (v.paused) {
        this.setPlayLabel(false);
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Stop repeating the line; the video itself is left as it is (only Pause pauses it). */
  private stopLoop(): void {
    clearTimeout(this.loopTimer);
    this.stopAt = null;
  }

  private watching = 0;
  private lastFollow = 0;

  /**
   * Highlight the line the video is on, a few times a second, whoever started it (our Play, or the
   * site's own controls). It is only a highlight: the line being typed and its caret stay put.
   */
  private followPlayback(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastFollow < 250) return;
    this.lastFollow = now;
    const v = this.video;
    if (!v || !this.typing || !this.segments.length) return;
    const t = v.currentTime;
    let at = -1;
    for (let k = 0; k < this.segments.length; k++) {
      if (this.segments[k].start - PAD_BEFORE > t) break;
      at = k;
    }
    if (at >= 0 && t > this.segments[at].end + 1.5 && this.segments[at + 1]?.start - t > 1.5) at = -1; // a gap between lines
    this.inline.setPlaying(v.paused && t === 0 ? -1 : at);
  }

  /** Watch the player while the panel is open: a play started on the site's own controls is followed too. */
  private startWatching(): void {
    clearInterval(this.watching);
    this.watching = window.setInterval(() => {
      const v = (this.video = this.video ?? findVideo());
      if (!v) return;
      this.setPlayLabel(!v.paused);
      if (!v.paused) this.watch();
      else this.followPlayback(true);
    }, 500);
  }

  private setPlayLabel(playing: boolean): void {
    const b = this.root.querySelector('[data-act="play"]');
    if (b) setHTML(b as HTMLElement, playing ? `${icon.pause()}<span>Pause</span>` : `${icon.play()}<span>Play</span>`);
  }

  // ------------------------------------------------------------ input

  private act(name: string): void {
    switch (name) {
      case 'play': this.togglePlay(); break;
      case 'back': this.nudge(-this.skip); break;
      case 'fwd': this.nudge(this.skip); break;
      case 'prev': this.prev(); break;
      case 'next': this.next(); break;
      case 'loop':
        this.loop = !this.loop;
        this.root.querySelector('[data-act="loop"]')?.classList.toggle('on', this.loop);
        if (!this.loop) this.stopLoop();
        else if (this.segments[this.index] && this.video && !this.video.paused) this.stopAt = this.segments[this.index].end + PAD_AFTER;
        void this.save();
        break;
      case 'check': this.check(); break;
      case 'hint': this.giveHint(); break;
      case 'answer': this.showAnswer(); break;
      case 'here': this.goToVideoTime(); break;
      case 'load': (this.refs.file as HTMLInputElement).click(); break;
      case 'reset':
        if (confirm('Start this recording over? Your answers here will be cleared.')) {
          this.results = {};
          if (this.typing) this.inline.attach(this.lines);
          this.root.querySelectorAll('.md-done').forEach((el) => el.classList.remove('md-done'));
          document.querySelectorAll('.md-done').forEach((el) => el.classList.remove('md-done'));
          this.show(0);
        }
        break;
      case 'connect': openConnect(); break;
      case 'settings': this.toggleSettings(); return;
      case 'collapse': this.collapse(true); break;
      case 'close': this.close(); break;
      default: return;
    }
    if (!['collapse', 'close', 'load', 'reset', 'connect'].includes(name)) this.focus();
  }

  /** One of the learner's shortcut keys, wherever it was pressed. */
  runKey(action: KeyAction): void {
    this.act(action === 'forward' ? 'fwd' : action);
  }

  /** Panel keys pressed while the focus is on the page itself (the video, empty space). */
  private onPageKey(e: KeyboardEvent): void {
    if (!this.isOpen || !this.segments.length || e.isComposing) return;
    const target = e.target as HTMLElement | null;
    if (target === this.host || target?.closest?.('.md-line')) return; // handled there
    if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return; // the site's own fields
    const action = actionFor(e);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.runKey(action);
  }

  /** The key list under the controls and the buttons' tooltips, from the learner's keys. */
  private drawKeyHelp(): void {
    const k = keys();
    const cap = (combo: string) => keyCaps(combo).map((c) => `<kbd>${esc(c)}</kbd>`).join('+');
    const rows: [string, string][] = [
      [cap(k.play), 'play / pause'],
      [`${cap(k.back)} ${cap(k.forward)}`, `back / forward ${this.skip} s`],
      ['<kbd>Enter</kbd>', 'check, then next line'],
      ['<kbd>Space</kbd> <kbd>Tab</kbd>', 'next word'],
      [`${cap(k.prev)} ${cap(k.next)}`, 'previous / next line'],
      [cap(k.loop), 'loop the line'],
      [cap(k.hint), 'hint'],
      [cap(k.answer), 'show answer'],
    ];
    setHTML(this.refs.keygrid, rows.map(([keysHtml, what]) => `<dt>${keysHtml}</dt><dd>${what}</dd>`).join(''));
    setHTML(
      this.refs.keyline,
      `${cap(k.play)} play ${cap(k.back)}/${cap(k.forward)} ±${this.skip}s <kbd>Enter</kbd> check · next ${cap(k.hint)} hint ${cap(k.prev)}/${cap(k.next)} move · <a data-act="settings">change keys</a>`,
    );
    const plain = (combo: string) => keyCaps(combo).join('+');
    const titles: Record<string, string> = {
      prev: `Previous segment (${plain(k.prev)})`,
      play: `Play / pause segment (${plain(k.play)})`,
      back: `Back ${this.skip} s (${plain(k.back)})`,
      fwd: `Forward ${this.skip} s (${plain(k.forward)})`,
      next: `Next segment (${plain(k.next)})`,
      loop: `Loop segment (${plain(k.loop)})`,
      hint: plain(k.hint),
      answer: plain(k.answer),
    };
    this.root.querySelectorAll<HTMLElement>('button[data-act="back"]').forEach((b) => (b.textContent = `−${this.skip}s`));
    this.root.querySelectorAll<HTMLElement>('button[data-act="fwd"]').forEach((b) => (b.textContent = `+${this.skip}s`));
    for (const [act, title] of Object.entries(titles)) {
      this.root.querySelectorAll<HTMLElement>(`button[data-act="${act}"]`).forEach((b) => (b.title = title));
    }
  }

  private toggleSettings(show = this.refs.settings.classList.contains('hidden')): void {
    if (show && !this.settings) {
      this.settings = mountSettings(this.refs.settings, {
        keys: keys(),
        onSave: (map) => saveKeys(map),
        onClose: () => this.toggleSettings(false),
      });
    }
    this.refs.settings.classList.toggle('hidden', !show);
    this.refs.gear.classList.toggle('on', show);
    this.refs.body.classList.toggle('in-settings', show);
    if (!show) this.focus();
  }

  private focus(): void {
    if (this.typing) {
      requestAnimationFrame(() => this.inline.focus(this.index, true));
      return;
    }
    requestAnimationFrame(() => this.box.focus());
  }

  private note(text: string): void {
    this.refs.note.textContent = text;
    this.refs.note.classList.toggle('hidden', !text);
  }

  private status(html: string): void {
    setHTML(this.refs.status, html);
    this.refs.status.classList.remove('hidden');
    this.refs.main.classList.add('hidden');
  }

  private async save(): Promise<void> {
    if (!this.segments.length) return;
    this.schedulePush(1500);
    await storage.set(this.progressKey, {
      fp: transcriptFingerprint(this.segments),
      index: this.index,
      results: this.results,
      rate: this.rate,
      loop: this.loop,
      blur: this.blur,
    });
  }

  /** Send progress to the account (debounced). Silent when not signed in. */
  private schedulePush(delayMs: number): void {
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.push(), delayMs);
  }

  private async push(): Promise<void> {
    if (!this.email || !this.segments.length) return;
    const seconds = Math.min(3600, Math.round(this.played));
    const ok = await pushProgress({
      key: this.progressKey,
      title: pageTitle(),
      url: location.href,
      site: siteName(),
      fp: transcriptFingerprint(this.segments),
      total: this.segments.length,
      index: this.index,
      results: this.results,
      day: new Intl.DateTimeFormat('en-CA').format(new Date()),
      playedSeconds: seconds,
    });
    if (ok) this.played -= seconds;
  }

  private pillDragged = false;

  /** After the card opens where the pill was moved to, pull it back inside the window. */
  private keepOnScreen(): void {
    const wrap = this.root.querySelector<HTMLElement>('.wrap')!;
    const r = wrap.getBoundingClientRect();
    if (r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight) return;
    wrap.style.left = `${Math.max(0, Math.min(window.innerWidth - r.width, r.left))}px`;
    wrap.style.top = `${Math.max(0, Math.min(window.innerHeight - r.height, r.top))}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
  }

  /** The pill moves the same box; it is pinned by its bottom-right corner so the card opens up and left from it. */
  private makePillDraggable(): void {
    const wrap = this.root.querySelector<HTMLElement>('.wrap')!;
    const pill = this.refs.pill;
    pill.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = wrap.getBoundingClientRect();
      const fromRight = r.right - e.clientX;
      const fromBottom = r.bottom - e.clientY;
      const x0 = e.clientX;
      const y0 = e.clientY;
      this.pillDragged = false;
      pill.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        if (!this.pillDragged && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        this.pillDragged = true;
        const right = window.innerWidth - (ev.clientX + fromRight);
        const bottom = window.innerHeight - (ev.clientY + fromBottom);
        wrap.style.right = `${Math.max(0, Math.min(window.innerWidth - r.width, right))}px`;
        wrap.style.bottom = `${Math.max(0, Math.min(window.innerHeight - r.height, bottom))}px`;
        wrap.style.left = 'auto';
        wrap.style.top = 'auto';
      };
      const up = () => {
        pill.removeEventListener('pointermove', move);
        pill.removeEventListener('pointerup', up);
        pill.removeEventListener('pointercancel', up);
      };
      pill.addEventListener('pointermove', move);
      pill.addEventListener('pointerup', up);
      pill.addEventListener('pointercancel', up);
    });
  }

  /**
   * The card resizes from its bottom-right corner (CSS resize). The box is pinned by its bottom-right
   * corner, which would make it grow the wrong way, so a press on the corner pins it by its top-left
   * first. The size is remembered.
   */
  private makeResizable(): void {
    const wrap = this.root.querySelector<HTMLElement>('.wrap')!;
    const card = this.refs.card;
    card.addEventListener('pointerdown', (e) => {
      const r = card.getBoundingClientRect();
      if (e.clientX < r.right - 18 || e.clientY < r.bottom - 18) return;
      const w = wrap.getBoundingClientRect();
      wrap.style.left = `${w.left}px`;
      wrap.style.top = `${w.top}px`;
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
    });
    void chrome.storage.local
      .get(SIZE_PREF)
      .then((got) => {
        const size = got[SIZE_PREF] as { w: number; h: number } | undefined;
        if (size?.w && size?.h) {
          card.style.width = `${size.w}px`;
          card.style.height = `${size.h}px`;
        }
      })
      .catch(() => {});
    let timer = 0;
    new ResizeObserver(() => {
      // Only a size the learner set by hand (inline style), never the default.
      if (!card.style.width || card.classList.contains('hidden')) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          void chrome.storage.local.set({ [SIZE_PREF]: { w: card.offsetWidth, h: card.offsetHeight } });
        } catch {
          /* extension reloaded under the page */
        }
      }, 400);
    }).observe(card);
  }

  private makeDraggable(): void {
    const wrap = this.root.querySelector<HTMLElement>('.wrap')!;
    const head = this.refs.head;
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const r = wrap.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        wrap.style.left = `${Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx))}px`;
        wrap.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy))}px`;
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }
}
