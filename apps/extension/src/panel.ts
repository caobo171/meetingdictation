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
import { grade, hasWords, hint, type Grade } from '@md/core';
import { buildSegments, mergeResults, parseSubtitleFile, transcriptFingerprint, type Segment } from '@md/core';
import { InlineBlanks, type LineState } from './inline';
import {
  detectSource,
  findVideo,
  isLoom,
  isStream,
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
import { actionFor, isTypeThrough, keyCaps, keys, loadKeys, onKeysChange, saveKeys, type KeyAction } from './keys';
import { mountCheckbox, mountSelect, mountSettings } from './ui';

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
const NUDGE = 2;

const TYPE_IN_PREF = 'mdTypeIn';
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

/** The site's transcript lines that have words in them. */
function typeableLines(): TranscriptLine[] {
  return transcriptLines().filter((l) => hasWords(l.text));
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
  return location.hostname.replace(/^www\./, '');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2333; }
.card { width: 400px; max-width: calc(100vw - 32px); background: #fff; border: 1px solid #e3e5ee; border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 24, 50, .22); overflow: hidden; }
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
button.b { border: 1px solid #d9dce8; background: #f7f8fc; color: #1f2333; border-radius: 8px; padding: 6px 9px; cursor: pointer; font: inherit; font-size: 13px; }
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
.check label { cursor: pointer; }
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
footer .acct { flex-basis: 100%; }
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
  button.sel:hover, button.keybtn:hover { background: #1f2230; }
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
      <button data-act="settings" title="Shortcut keys" data-ref="gear"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4L10.7 6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
      <button data-act="collapse" title="Minimise">–</button>
      <button data-act="close" title="Close and un-blur">×</button>
    </header>
    <div class="body" data-ref="body">
      <div data-ref="settings" class="hidden"></div>
      <div data-ref="status" class="msg">Looking for the transcript…</div>
      <div data-ref="main" class="hidden" style="display:grid;gap:10px">
        <div class="bar"><div data-ref="bar"></div></div>
        <div class="meta"><span data-ref="pos"></span><span class="who" data-ref="who"></span><span data-ref="stats"></span></div>
        <div class="controls">
          <button class="b" data-act="prev" title="Previous segment (Alt+←)">⏮</button>
          <button class="b primary play" data-act="play" title="Play / pause segment (1)">▶ Play</button>
          <button class="b" data-act="back" title="Back 2 s (2)">−2s</button>
          <button class="b" data-act="fwd" title="Forward 2 s (3)">+2s</button>
          <button class="b" data-act="next" title="Next segment (Alt+→)">⏭</button>
          <button class="b" data-act="loop" title="Loop segment (Alt+L)">🔁</button>
          <span data-ref="ratio" class="hidden"></span>
          <span data-ref="rate"></span>
        </div>
        <div class="msg hidden" data-ref="typeHelp">Type in the blanks in the transcript.
          <dl class="keygrid" data-ref="keygrid"></dl>
        </div>
        <textarea data-ref="input" spellcheck="false" autocomplete="off" placeholder="Type what you hear…  (1 = play, Enter = check)"></textarea>
        <div class="verdict bad hidden" data-ref="note"></div>
        <div class="verdict" data-ref="verdict"></div>
        <div class="result" data-ref="result"></div>
        <div class="actions">
          <button class="b primary" data-act="check">Check ⏎</button>
          <button class="b" data-act="hint" title="Alt+H">Hint</button>
          <button class="b" data-act="answer" title="Alt+A">Show answer</button>
          <span class="spacer"></span>
          <button class="b" data-act="here" title="Go to the segment at the video's current time">⌖ Here</button>
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
  private lines: TranscriptLine[] = [];
  private playerWoken = false;
  private inline = new InlineBlanks(
    {
      select: (i) => {
        if (i !== this.index) this.show(i, false);
      },
      check: (i) => {
        if (i !== this.index) this.show(i, false);
        this.check();
        this.focus();
      },
      key: (action) => this.runKey(action),
    },
    (i) => this.lineState(i),
    typeableLines,
  );

  constructor() {
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
    this.refs.pill.addEventListener('click', () => this.open());
    // The keys work wherever the focus is, not only in a blank: clicking the video moves
    // focus to the page, and the site's player would take 1/2/3 (YouTube jumps to 10/20/30%).
    window.addEventListener('keydown', (e) => this.onPageKey(e), true);
    this.refs.input.addEventListener('keydown', (e) => this.onKey(e as KeyboardEvent));
    const portal = this.root.querySelector<HTMLElement>('.wrap')!;
    this.rateSel = mountSelect(this.refs.rate, portal, {
      title: 'Speed',
      value: '1',
      options: ['0.5', '0.75', '0.9', '1', '1.25'].map((v) => ({ value: v, label: `${v}×` })),
      onChange: (v) => {
        this.rate = Number(v);
        if (this.video) this.video.playbackRate = this.rate;
        void this.save();
        this.focus();
      },
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
        ? `☁️ Synced to <b>${esc(this.email)}</b>`
        : '☁️ <a data-act="connect">Sign in to MeetingDictation</a> to save progress & streak',
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
    const hasList = isLoom() || isYouTube();
    this.refs.typeInWrap.classList.toggle('hidden', !hasList);
    this.typeInBox.set(this.typeIn);
    if (hasList && this.typeIn && (await this.startTyping())) return;
    const source = await detectSource(this.video);
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

  private async switchTypeIn(on: boolean): Promise<void> {
    this.typeIn = on;
    setTypeInPref(on);
    this.pauseSegment();
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
    this.pauseSegment();
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
    this.segments = buildSegments(source.cues).filter((s) => hasWords(s.text));
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
      if (this.typing && !this.inline.attached) {
        this.lines = typeableLines();
        this.inline.attach(this.lines);
        this.inline.setCurrent(this.index, true);
      }
    }
  }

  close(): void {
    this.pauseSegment();
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
    if (!on) this.focus();
  }

  // ------------------------------------------------------------ segment view

  private show(i: number, scroll = true): void {
    this.pauseSegment();
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
    const input = this.refs.input as HTMLTextAreaElement;
    input.value = r?.typed ?? '';
    input.classList.toggle('pass', !!r?.passed);
    this.refs.result.textContent = '';
    this.refs.verdict.textContent = '';
    this.refs.verdict.className = 'verdict';
    if (r) this.renderGrade(grade(seg.text, r.typed), r.revealed);
    this.refs.pos.textContent = `Segment ${this.index + 1} / ${this.segments.length} · ${fmt(seg.start)}`;
    this.refs.who.textContent = seg.speaker ?? '';
    this.updateStats();
    void this.save();
  }

  private updateStats(): void {
    const done = Object.values(this.results).filter((r) => r.passed || r.revealed).length;
    const scored = Object.values(this.results);
    const avg = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 100) : 0;
    const pct = Math.round((done / this.segments.length) * 100);
    (this.refs.bar as HTMLElement).style.width = `${pct}%`;
    this.refs.stats.textContent = scored.length ? `${pct}% done · ~${avg}% right` : `${pct}% done`;
    this.refs.pillText.textContent = `Dictation ${this.index + 1}/${this.segments.length}`;
  }

  private renderGrade(g: Grade, revealed: boolean): void {
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
    if (g.passed) {
      v.textContent = '✓ Perfect! Enter for the next segment';
      v.className = 'verdict good';
    } else if (revealed) {
      v.textContent = 'Answer shown. Type it out, or Enter to move on';
      v.className = 'verdict bad';
    } else {
      const missing = g.words.filter((w) => w.state === 'missing' || w.state === 'partial').length;
      v.textContent = `${Math.round(g.score * 100)}% · ${missing} word${missing === 1 ? '' : 's'} to fix`;
      v.className = 'verdict bad';
    }
  }

  private lineVerdict(r?: Result): void {
    const v = this.refs.verdict;
    if (!r) {
      v.textContent = '';
      v.className = 'verdict';
    } else if (r.passed) {
      v.textContent = '✓ Perfect! Enter for the next line';
      v.className = 'verdict good';
    } else if (r.revealed) {
      v.textContent = 'Answer shown. Enter for the next line';
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
    this.results[i] = { typed, score: Math.max(prev?.score ?? 0, g.score), passed: g.passed, revealed: false };
    this.inline.paint(i);
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
    const typed = (this.refs.input as HTMLTextAreaElement).value;
    const prev = this.results[this.index];
    if ((prev?.passed || prev?.revealed) && typed === prev.typed) {
      this.next();
      return;
    }
    if (!typed.trim()) {
      this.playSegment(true);
      return;
    }
    const g = grade(seg.text, typed);
    const revealed = !!prev?.revealed;
    this.results[this.index] = {
      typed,
      // first honest attempt sets the score; typing a revealed answer does not raise it
      score: revealed ? prev.score : Math.max(prev?.score ?? 0, g.score),
      passed: g.passed,
      revealed,
    };
    (this.refs.input as HTMLTextAreaElement).classList.toggle('pass', g.passed);
    this.renderGrade(g, revealed);
    this.updateStats();
    this.revealRows();
    void this.save();
  }

  private giveHint(): void {
    if (this.typing) {
      this.inline.hint(this.index);
      return;
    }
    const input = this.refs.input as HTMLTextAreaElement;
    input.value = hint(this.segments[this.index].text, input.value);
    input.setSelectionRange(input.value.length, input.value.length);
    this.focus();
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
    const typed = (this.refs.input as HTMLTextAreaElement).value;
    const seg = this.segments[this.index];
    const g = grade(seg.text, typed);
    const prev = this.results[this.index];
    this.results[this.index] = { typed, score: prev?.score ?? g.score, passed: g.passed, revealed: true };
    this.renderGrade(g, true);
    this.updateStats();
    this.revealRows();
    void this.save();
    this.focus();
  }

  private next(): void {
    if (this.index < this.segments.length - 1) {
      this.show(this.index + 1);
      this.playSegment(true);
    } else {
      this.refs.verdict.textContent = '🎉 You reached the end of the recording!';
      this.refs.verdict.className = 'verdict good';
    }
  }

  private prev(): void {
    if (this.index > 0) {
      this.show(this.index - 1);
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
      const done = inRow.length > 0 && inRow.every(({ k }) => this.results[k]?.passed || this.results[k]?.revealed);
      row.el.classList.toggle('md-done', done);
    });
  }

  // ------------------------------------------------------------ playback

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
    const stop = seg.end + PAD_AFTER;
    const outside = v.currentTime < seg.start - PAD_BEFORE - 0.05 || v.currentTime >= stop - 0.05;
    if (fromStart || outside || v.ended) v.currentTime = Math.max(0, seg.start - PAD_BEFORE);
    v.playbackRate = this.rate;
    this.stopAt = stop;
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
    if (v && !v.paused && this.stopAt !== null) this.pauseSegment();
    else this.playSegment(false);
  }

  private nudge(delta: number): void {
    const v = this.video;
    if (!v || !this.segments.length) return;
    const seg = this.segments[this.index];
    v.currentTime = Math.min(Math.max(seg.start - PAD_BEFORE, v.currentTime + delta), seg.end);
    if (v.paused) this.playSegment(false);
  }

  private watch(): void {
    cancelAnimationFrame(this.raf);
    this.lastTick = performance.now();
    const tick = () => {
      const v = this.video;
      if (!v || this.stopAt === null) return;
      const now = performance.now();
      if (!v.paused) this.played += Math.min(1, (now - this.lastTick) / 1000);
      this.lastTick = now;
      if (v.currentTime >= this.stopAt) {
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

  private pauseSegment(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.loopTimer);
    if (this.video && this.stopAt !== null && !this.video.paused) this.video.pause();
    this.setPlayLabel(false);
  }

  private setPlayLabel(playing: boolean): void {
    const b = this.root.querySelector('[data-act="play"]');
    if (b) b.textContent = playing ? '❚❚ Pause' : '▶ Play';
  }

  // ------------------------------------------------------------ input

  private act(name: string): void {
    switch (name) {
      case 'play': this.togglePlay(); break;
      case 'back': this.nudge(-NUDGE); break;
      case 'fwd': this.nudge(NUDGE); break;
      case 'prev': this.prev(); break;
      case 'next': this.next(); break;
      case 'loop':
        this.loop = !this.loop;
        this.root.querySelector('[data-act="loop"]')?.classList.toggle('on', this.loop);
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

  private onKey(e: KeyboardEvent): void {
    if (e.isComposing) return;
    const input = e.target as HTMLTextAreaElement;
    if (isTypeThrough(e)) {
      e.preventDefault();
      input.setRangeText(e.key, input.selectionStart, input.selectionEnd, 'end');
      return;
    }
    const action = actionFor(e);
    if (action) {
      e.preventDefault();
      this.runKey(action);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.check();
    }
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
      [`${cap(k.back)} ${cap(k.forward)}`, 'back / forward 2 s'],
      ['<kbd>Enter</kbd>', 'check, then next line'],
      ['<kbd>Space</kbd>', 'next word'],
      [`${cap(k.prev)} ${cap(k.next)}`, 'previous / next line'],
      [cap(k.loop), 'loop the line'],
      [cap(k.hint), 'hint'],
      [cap(k.answer), 'show answer'],
    ];
    setHTML(this.refs.keygrid, rows.map(([keysHtml, what]) => `<dt>${keysHtml}</dt><dd>${what}</dd>`).join(''));
    setHTML(
      this.refs.keyline,
      `${cap(k.play)} play ${cap(k.back)}/${cap(k.forward)} ±2s <kbd>Enter</kbd> check · next ${cap(k.hint)} hint ${cap(k.prev)}/${cap(k.next)} move · <a data-act="settings">change keys</a>`,
    );
    const plain = (combo: string) => keyCaps(combo).join('+');
    const titles: Record<string, string> = {
      prev: `Previous segment (${plain(k.prev)})`,
      play: `Play / pause segment (${plain(k.play)})`,
      back: `Back 2 s (${plain(k.back)})`,
      fwd: `Forward 2 s (${plain(k.forward)})`,
      next: `Next segment (${plain(k.next)})`,
      loop: `Loop segment (${plain(k.loop)})`,
      hint: plain(k.hint),
      answer: plain(k.answer),
    };
    for (const [act, title] of Object.entries(titles)) {
      this.root.querySelectorAll<HTMLElement>(`button[data-act="${act}"]`).forEach((b) => (b.title = title));
    }
    (this.refs.input as HTMLTextAreaElement).placeholder = `Type what you hear…  (${plain(k.play)} = play, Enter = check)`;
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
    requestAnimationFrame(() => (this.refs.input as HTMLTextAreaElement).focus({ preventScroll: true }));
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
