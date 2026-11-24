/**
 * "Type in the transcript": every line of the site's own transcript (Loom's
 * list, YouTube's panel) becomes a row of blanks, one per spoken word, with
 * punctuation and the speaker's name left showing. The learner types straight
 * into the line, as on WELE's podcast page:
 *
 *   Space / Tab   next blank        Backspace on an empty blank   previous one
 *   Enter         check the line; Enter on a finished line plays the next one
 *   1 / 2 / 3     play the line, back / forward a few seconds (the learner can change these in settings)
 *   Alt+H hint    Alt+A answer      Alt+← / Alt+→ previous / next line
 *
 * The site's own text element is hidden, not removed, and the blanks sit next
 * to it, so the site's own rendering is never fought. If the site re-renders a
 * row, a mutation observer puts the blanks back with what was typed.
 */

import { blankParts, isSmallTalk, wordMatches, type BlankPart } from '@md/core';
import type { TranscriptLine } from './sources';
import { iconNode } from './icons';
import { actionFor, isTypeThrough, type KeyAction } from './keys';

export interface BlankHost {
  /** The learner moved into line i (click or keyboard). */
  select(i: number): void;
  /** A click on line i away from its blanks: move the video to the line, as the site's row would. */
  seek(i: number): void;
  /** Enter on line i. */
  check(i: number): void;
  /** One of the learner's shortcut keys (play, hint, …). */
  key(action: KeyAction): void;
}

export interface LineState {
  /** What is in the blanks, "_" for an empty one, joined by spaces. */
  typed: string;
  revealed: boolean;
  /** Blanks that have been graded (Enter pressed at least once). */
  checked: boolean;
}

const STYLE_ID = 'meetingdictation-blanks';
const CSS = `
[data-md-src] { display: none !important; }
.md-line { position: relative; display: block; line-height: 2.05; filter: none !important; user-select: text; cursor: text; }
.md-line.md-playing { background: rgba(245, 158, 11, .14); border-radius: 6px; }
.md-line.md-cur { background: rgba(79, 70, 229, .06); border-radius: 6px; }
.md-line.md-cur.md-playing { background: linear-gradient(rgba(245, 158, 11, .12), rgba(245, 158, 11, .12)), rgba(79, 70, 229, .06); }
.md-line .md-who { font-weight: 700; margin-right: 6px; }
.md-line .md-fill { opacity: .5; font-style: italic; }
.md-line .md-given { opacity: .85; }
.md-line input.md-blank {
  all: unset; box-sizing: content-box; display: inline-block; font: inherit; color: inherit; line-height: 1.35;
  min-width: 1.4ch; padding: 0 3px; margin: 0 1px; vertical-align: baseline; text-align: left;
  background: rgba(79, 70, 229, .07); border-bottom: 2px solid #b9bdd6; border-radius: 4px 4px 0 0; caret-color: #4f46e5;
}
.md-line input.md-blank:focus { background: rgba(79, 70, 229, .15); border-bottom-color: #4f46e5; }
.md-line input.md-blank.ok { color: #15803d; background: rgba(34, 197, 94, .12); border-bottom-color: #22c55e; }
.md-line input.md-blank.bad { color: #dc2626; background: rgba(239, 68, 68, .09); border-bottom-color: #ef4444; }
.md-line input.md-blank.hinted { color: #c2410c; border-bottom-color: #fb923c; }
.md-line input.md-blank.rev { color: #b91c1c; font-style: italic; border-bottom-style: dotted; background: transparent; }
.md-line .md-submit { all: unset; display: none; align-items: center; gap: 4px; vertical-align: middle; margin-left: 8px; padding: 2px 9px; height: 24px; box-sizing: border-box; border-radius: 999px; background: #4f46e5; color: #fff; font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; }
.md-line .md-submit:hover { background: #4338ca; }
.md-line.md-cur .md-submit { display: inline-flex; }
.md-line .md-diff { user-select: text; }
.md-line.md-submitted .md-words, .md-line.md-submitted .md-submit { display: none !important; }
.md-line .md-d-plain { opacity: .85; }
.md-line .md-d-fill { opacity: .5; font-style: italic; }
.md-line .md-d-ok { color: #15803d; }
.md-line .md-d-hint { color: #c2410c; }
.md-line .md-d-miss { color: #dc2626; font-weight: 600; }
.md-line .md-d-x { color: #dc2626; opacity: .7; text-decoration: line-through; }
.md-line .md-mark { display: inline-flex; vertical-align: middle; margin-left: 8px; font-size: 12px; color: #15803d; font-weight: 700; }
`;

/**
 * Width of text in the transcript's font, measured on a canvas. Measuring a
 * hidden copy in the page would be exact, but each read forces the browser to
 * lay out the whole page, and a long Loom transcript has thousands of blanks:
 * that froze the tab. The canvas uses the same font and letter-spacing, and a
 * blank and what is typed in it are measured the same way, so the spare room
 * below keeps the width steady while typing.
 */
let pen: { ctx: CanvasRenderingContext2D; plain: string; italic: string; spacing: string } | null = null;

function textWidth(input: HTMLInputElement, text: string): number {
  if (!text) return 0;
  if (!pen) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return text.length * 8;
    const cs = getComputedStyle(input);
    const rest = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    pen = { ctx, plain: `${cs.fontStyle === 'italic' ? 'normal' : cs.fontStyle} ${rest}`, italic: `italic ${rest}`, spacing: cs.letterSpacing };
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = pen.spacing === 'normal' ? '0px' : pen.spacing;
  }
  pen.ctx.font = input.classList.contains('rev') ? pen.italic : pen.plain;
  return pen.ctx.measureText(text).width;
}

/**
 * Size a blank to its word, with room to spare so typing the last letter never
 * reaches the edge; it grows only when what is typed is longer than that.
 */
function blankWidth(input: HTMLInputElement, word: string): void {
  if (!input.isConnected) return; // sized once it is on the page
  // A finished word (right, hinted, or the answer shown) fits its text, so the line reads evenly.
  if (input.matches('.ok, .hinted, .rev')) {
    input.style.width = `${Math.ceil(textWidth(input, input.value || word) + 2)}px`;
    return;
  }
  const spare = textWidth(input, 'm') * 0.35;
  const px = Math.max(textWidth(input, word) + spare, textWidth(input, input.value) + 3, textWidth(input, 'n'));
  input.style.width = `${Math.ceil(px)}px`;
}

export class InlineBlanks {
  private lines: TranscriptLine[] = [];
  private parts: BlankPart[][] = [];
  private nodes: (HTMLElement | null)[] = [];
  private current = -1;
  private observer: MutationObserver | null = null;
  private repairTimer = 0;
  private hinted = new Map<number, Set<number>>();
  /** Share of words that are blanks (1 = every word). */
  private ratio = 1;
  /** Per line, which word slots are blanks; the other words are shown. */
  private blankSlots: Set<number>[] = [];
  /** Typed but unchecked words, kept by slot while a ratio change hides their blank. */
  private kept: string[][] = [];

  /** Scrolling a virtual list toward the current line, which has no row on the page yet. */
  private scrollTimer = 0;

  constructor(
    private host: BlankHost,
    private stateOf: (i: number) => LineState | undefined,
    /** The site's lines as they are now, to find a row the site replaced. */
    private currentLines: () => TranscriptLine[],
    /** Scroll the site's list toward a line it has not drawn (Teams draws only the rows on screen). */
    private offscreen?: (line: TranscriptLine) => void,
  ) {}

  /** Turn these lines into blanks. */
  attach(lines: TranscriptLine[]): void {
    this.detach();
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    pen = null; // the site's font may differ from the last page
    // Keys are caught on the window before anything else sees them: the site's player
    // (Stream's, in Teams) takes arrows and Alt+arrows for itself on the way down.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) window.addEventListener(type, this.keyCatcher, true);
    window.addEventListener('click', this.rowClick, true);
    this.lines = lines;
    // A greeting or small talk ("Hi, Mark. Hi, Joe.") is shown whole, not asked for.
    this.parts = lines.map((l) =>
      isSmallTalk(l.text) ? blankParts(l.text).map((p) => ({ ...p, filler: !!p.word, given: true })) : blankParts(l.text),
    );
    this.blankSlots = lines.map((_, i) => this.pickBlanks(i));
    this.nodes = lines.map(() => null);
    lines.forEach((_, i) => this.render(i));
    this.observer = new MutationObserver((records) => {
      // Our own lines changing (typing, colours) is not the site re-rendering.
      if (records.every((r) => (r.target as Element).closest?.('.md-line'))) return;
      // At most every 200 ms, never postponed: a page that changes all the time (a playing
      // video's clock) would otherwise keep pushing the repair back for ever.
      if (!this.repairTimer) {
        this.repairTimer = window.setTimeout(() => {
          this.repairTimer = 0;
          this.repair();
        }, 200);
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  detach(): void {
    for (const type of ['keydown', 'keyup', 'keypress'] as const) window.removeEventListener(type, this.keyCatcher, true);
    window.removeEventListener('click', this.rowClick, true);
    this.observer?.disconnect();
    this.observer = null;
    clearTimeout(this.repairTimer);
    this.repairTimer = 0;
    clearInterval(this.scrollTimer);
    for (const node of this.nodes) node?.remove();
    for (const l of this.lines) l.el.removeAttribute('data-md-src');
    document.querySelectorAll('.md-line').forEach((n) => n.remove());
    document.querySelectorAll('[data-md-src]').forEach((n) => n.removeAttribute('data-md-src'));
    this.nodes = [];
    this.lines = [];
    this.current = -1;
    this.hinted.clear();
    this.kept = [];
  }

  /**
   * A click in a sentence's row but outside its blanks (the row's padding, the gap around
   * the words): the site's own sentence is hidden, so treat it as a click on the line.
   */
  private rowClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    // Only the learner's own clicks: the one siteClick passes on comes back through here.
    if (!e.isTrusted || !target?.closest || e.button !== 0 || target.closest('.md-line, a, button, input, [role="button"]')) return;
    const row = target.closest<HTMLElement>(':has(> .md-line)');
    const boxes = row ? row.querySelectorAll<HTMLElement>(':scope > .md-line') : [];
    if (boxes.length !== 1) return; // a container of many lines, not one sentence's row
    const i = Number(boxes[0].dataset.mdI);
    if (this.nodes[i] !== boxes[0]) return;
    e.stopPropagation();
    this.siteClick(i);
    this.focus(i, true);
    this.host.seek(i);
  };

  private keyCatcher = (e: Event): void => {
    const box = (e.target as Element | null)?.closest?.<HTMLElement>('.md-line');
    if (!box?.dataset.mdI || this.nodes[Number(box.dataset.mdI)] !== box) return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown') this.onKey(e as KeyboardEvent, Number(box.dataset.mdI));
  };

  /**
   * Hand a click on line i to the site's own sentence under the blanks (hidden, still in place):
   * Teams, Loom and YouTube move the video to a sentence when it is clicked.
   */
  private siteClick(i: number): void {
    const el = this.lines[i]?.el;
    if (!el?.isConnected) return;
    const at = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...at, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', at));
    el.dispatchEvent(new PointerEvent('pointerup', { ...at, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', at));
    el.dispatchEvent(new MouseEvent('click', at));
  }

  get attached(): boolean {
    return this.lines.length > 0;
  }

  /**
   * Show only this share of words as blanks. Which words is fixed per line (a
   * hash of the line and word), so it never shuffles, and every line keeps at
   * least one blank. What was typed stays with its word.
   */
  setRatio(ratio: number): void {
    const next = Math.min(1, Math.max(0.05, ratio));
    if (next === this.ratio) return;
    this.ratio = next;
    if (!this.attached) return;
    this.hinted.clear();
    this.lines.forEach((_, i) => {
      const kept = (this.kept[i] ??= []);
      this.slotValues(i).forEach((v, k) => {
        if (this.blankSlots[i].has(k)) kept[k] = v;
      });
      this.blankSlots[i] = this.pickBlanks(i);
      this.render(i);
      this.restore(i, kept);
    });
    if (this.current >= 0) this.focus(this.current);
  }

  private wordCount(i: number): number {
    return this.parts[i].filter((p) => p.word && !p.filler).length;
  }

  private pickBlanks(i: number): Set<number> {
    const n = this.wordCount(i);
    const all = [...Array(n).keys()];
    if (this.ratio >= 1) return new Set(all);
    const words = this.parts[i].filter((p) => p.word && !p.filler).map((p) => p.word.toLowerCase());
    const hash = (str: string) => {
      let h = 2166136261;
      for (let c = 0; c < str.length; c += 1) h = Math.imul(h ^ str.charCodeAt(c), 16777619);
      return h >>> 0;
    };
    const keep = n ? Math.max(1, Math.round(n * this.ratio)) : 0;
    const ranked = all.sort((a, b) => hash(`${this.lines[i].start}|${a}|${words[a]}`) - hash(`${this.lines[i].start}|${b}|${words[b]}`));
    return new Set(ranked.slice(0, keep));
  }

  /** What is in each word slot of line i, by slot; shown words are "". */
  private slotValues(i: number): string[] {
    const out = Array<string>(this.wordCount(i)).fill('');
    for (const b of this.inputs(i)) out[Number(b.dataset.s)] = b.value;
    return out;
  }

  private restore(i: number, values: string[]): void {
    for (const b of this.inputs(i)) {
      const v = values[Number(b.dataset.s)];
      if (v) {
        b.value = v;
        blankWidth(b, this.wordOf(i, b));
      }
    }
  }

  // ------------------------------------------------------------ rendering

  private render(i: number): void {
    const line = this.lines[i];
    this.nodes[i]?.remove();
    const box = document.createElement('div');
    box.className = 'md-line';
    box.dataset.mdI = String(i);
    box.tabIndex = -1; // a submitted line holds the focus itself
    box.style.outline = 'none';
    if (line.speakerShown && line.speaker) {
      const who = document.createElement('span');
      who.className = 'md-who';
      who.textContent = line.speaker;
      box.append(who);
    }
    const state = this.stateOf(i);
    const typed = state ? state.typed.split(' ') : [];
    const blanks = this.blankSlots[i];
    let k = 0;
    let slot = 0;
    // The blanks sit in their own wrapper: a submitted line swaps it for the readable sentence.
    const words = document.createElement('span');
    words.className = 'md-words';
    this.parts[i].forEach((p, w) => {
      if (p.pre) words.append(p.pre);
      if (p.word && p.filler) {
        const f = document.createElement('span');
        f.className = (p as BlankPart & { given?: boolean }).given ? 'md-given' : 'md-fill';
        f.textContent = p.word;
        words.append(f);
      } else if (p.word && !blanks.has(slot)) {
        const given = document.createElement('span');
        given.className = 'md-given';
        given.textContent = p.word;
        words.append(given);
        slot += 1;
      } else if (p.word) {
        const input = document.createElement('input');
        input.className = 'md-blank';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('aria-label', `Word ${k + 1}`);
        input.dataset.w = String(w);
        input.dataset.s = String(slot);
        const v = typed[slot];
        input.value = v && v !== '_' ? v : '';
        words.append(input);
        k += 1;
        slot += 1;
      }
      if (p.post) words.append(p.post);
      words.append(' ');
    });
    box.append(words);
    // Submit the line by click as well as Enter; shown on the current line, and only when it has blanks.
    if (k > 0) {
      const submit = document.createElement('button');
      submit.type = 'button';
      submit.className = 'md-submit';
      submit.title = 'Submit this line (Enter)';
      submit.append(iconNode('send', 13), 'Submit');
      submit.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the blank
      submit.addEventListener('click', () => this.host.check(i));
      box.append(submit);
    }
    const mark = document.createElement('span');
    mark.className = 'md-mark';
    box.append(mark);

    // The row itself is a "seek to this time" button on Loom: keep our clicks and keys to ourselves.
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) {
      box.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'click' && !(e.target as HTMLElement).closest('input, .md-submit')) {
          this.siteClick(i); // first: the site may move focus to its row
          this.focus(i, true);
          this.host.seek(i);
        }
      });
    }
    box.addEventListener('input', (e) => this.onInput(e.target as HTMLInputElement, i));
    box.addEventListener('focusin', () => {
      if (this.current !== i) this.host.select(i);
    });

    line.el.setAttribute('data-md-src', '');
    line.el.after(box);
    box.querySelectorAll<HTMLInputElement>('input.md-blank').forEach((b) => blankWidth(b, this.parts[i][Number(b.dataset.w)].word));
    this.nodes[i] = box;
    if (state) this.paint(i);
    box.classList.toggle('md-cur', i === this.current);
    box.classList.toggle('md-playing', i === this.playing);
  }

  /** The site re-rendered: put back any blanks it dropped. */
  private repair(): void {
    let now: TranscriptLine[] | null = null;
    this.lines.forEach((line, i) => {
      const node = this.nodes[i];
      const intact = node?.isConnected && line.el.isConnected && line.el.nextElementSibling === node && line.el.hasAttribute('data-md-src');
      if (intact) return;
      if (!line.el.isConnected) {
        // Row element replaced (or drawn for the first time): find it by its id or start time.
        now ??= this.currentLines();
        const fresh = line.id !== undefined ? now.find((l) => l.id === line.id) : now.find((l) => Math.abs(l.start - line.start) < 0.01);
        if (!fresh) return;
        this.lines[i] = { ...line, el: fresh.el };
      }
      const hadFocus = node?.contains(document.activeElement);
      const drafts = this.slotValues(i);
      this.render(i);
      this.restore(i, drafts);
      if (hadFocus) this.focus(i);
    });
  }

  private inputs(i: number): HTMLInputElement[] {
    return [...(this.nodes[i]?.querySelectorAll<HTMLInputElement>('input.md-blank') ?? [])];
  }

  private wordOf(i: number, input: HTMLInputElement): string {
    return this.parts[i][Number(input.dataset.w)].word;
  }

  // ------------------------------------------------------------ state

  /** What is typed in line i, "_" for an empty blank. */
  /** One slot per spoken word, "_" when empty or shown, so a saved answer survives a change of ratio. */
  typed(i: number): string {
    return this.slotValues(i)
      .map((v) => v.trim().replace(/\s+/g, '') || '_')
      .join(' ');
  }

  isEmpty(i: number): boolean {
    return this.inputs(i).every((b) => !b.value.trim());
  }

  /** Score line i: fraction of blanks right. A word given by a hint completes the line but scores nothing. */
  grade(i: number): { score: number; passed: boolean; wrong: number } {
    const blanks = this.inputs(i);
    const hinted = this.hinted.get(i);
    const right = blanks.map((b) => wordMatches(this.wordOf(i, b), b.value));
    const earned = right.filter((ok, k) => ok && !hinted?.has(k)).length;
    const correct = right.filter(Boolean).length;
    return { score: earned / (blanks.length || 1), passed: correct === blanks.length, wrong: blanks.length - correct };
  }

  /** Colour line i from its saved state: green right, red wrong, answers shown if revealed. */
  paint(i: number): void {
    const state = this.stateOf(i);
    const hinted = this.hinted.get(i);
    let allRight = true;
    this.inputs(i).forEach((b, k) => {
      const word = this.wordOf(i, b);
      const right = wordMatches(word, b.value);
      allRight &&= right;
      // Marked only once the line is submitted (Enter), never while typing.
      const judged = !!state?.checked || !!state?.revealed;
      b.classList.toggle('ok', judged && right && !hinted?.has(k));
      b.classList.toggle('hinted', right && !!hinted?.has(k));
      b.classList.toggle('bad', !right && !!state?.checked && !state.revealed && !!b.value.trim());
      if (!right && state?.revealed) {
        b.value = word;
        b.classList.add('rev');
      } else if (!state?.revealed) b.classList.remove('rev');
      blankWidth(b, word);
    });
    const mark = this.nodes[i]?.querySelector('.md-mark');
    // A submitted line is done: the blanks give way to the readable sentence and a done mark.
    const submitted = !!state?.checked || !!state?.revealed;
    this.nodes[i]?.classList.toggle('md-submitted', submitted);
    if (mark) mark.replaceChildren(...(submitted ? [iconNode('check', 18)] : []));
    this.renderDiff(i, submitted);
  }

  /**
   * A submitted line, readable as WELE's result shows it: right words green, a wrong word crossed
   * out with the right one after it, a missed word in red. Built from what was submitted (the
   * blanks may have been filled with the answer since).
   */
  private renderDiff(i: number, show: boolean): void {
    const box = this.nodes[i];
    if (!box) return;
    box.querySelector('.md-diff')?.remove();
    if (!show) return;
    const submitted = (this.stateOf(i)?.typed ?? '').split(' ');
    const byWord = new Map(this.inputs(i).map((b, k) => [Number(b.dataset.w), { b, k }]));
    const hinted = this.hinted.get(i);
    const diff = document.createElement('span');
    diff.className = 'md-diff';
    const add = (cls: string, text: string) => {
      const el = document.createElement(cls === 'x' ? 's' : 'span');
      el.className = `md-d-${cls}`;
      el.textContent = text;
      diff.append(el);
    };
    this.parts[i].forEach((p, w) => {
      if (p.pre) diff.append(p.pre);
      const blank = byWord.get(w);
      if (p.word && !blank) add(p.filler ? 'fill' : 'plain', p.word); // shown in the line, never asked
      else if (p.word && blank) {
        const raw = submitted[Number(blank.b.dataset.s)] ?? '';
        const typed = raw === '_' ? '' : raw;
        if (wordMatches(p.word, typed)) add(hinted?.has(blank.k) ? 'hint' : 'ok', p.word);
        else {
          if (typed) {
            add('x', typed);
            diff.append(' ');
          }
          add('miss', p.word);
        }
      }
      if (p.post) diff.append(p.post);
      diff.append(' ');
    });
    box.querySelector('.md-words')?.after(diff);
  }

  /** The line the video is on right now (-1: none). Only a highlight: the caret stays where it is. */
  private playing = -1;

  setPlaying(i: number): void {
    if (i === this.playing) return;
    this.nodes[this.playing]?.classList.remove('md-playing');
    this.playing = i;
    this.nodes[i]?.classList.add('md-playing');
  }

  setCurrent(i: number, scroll: boolean): void {
    if (this.current >= 0) this.nodes[this.current]?.classList.remove('md-cur');
    this.current = i;
    const node = this.nodes[i];
    node?.classList.add('md-cur');
    clearInterval(this.scrollTimer);
    if (scroll && node?.isConnected) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (scroll && this.offscreen && this.lines[i]) {
      // Step toward it, letting the list draw between steps, until its row (and our blanks) appear.
      const step = this.offscreen;
      let tries = 0;
      step(this.lines[i]);
      this.scrollTimer = window.setInterval(() => {
        tries += 1;
        if (this.current !== i || tries > 20) return clearInterval(this.scrollTimer);
        if (!this.nodes[i]?.isConnected) this.repair(); // its row may be drawn already
        const now = this.nodes[i];
        if (now?.isConnected) {
          clearInterval(this.scrollTimer);
          now.scrollIntoView({ block: 'center' });
        } else step(this.lines[i]);
      }, 300);
    }
  }

  /** Put the caret in line i: the first blank that is still wrong, else the last one. */
  focus(i: number, keepIfInside = false): void {
    const box = this.nodes[i];
    if (box?.classList.contains('md-submitted')) {
      // No blanks to type in: the line itself takes the keys (Enter for the next line, 1 to replay…).
      if (!(keepIfInside && box.contains(document.activeElement))) box.focus({ preventScroll: true });
      return;
    }
    const blanks = this.inputs(i);
    if (!blanks.length) return;
    if (keepIfInside && this.nodes[i]?.contains(document.activeElement)) return;
    const target = blanks.find((b) => !wordMatches(this.wordOf(i, b), b.value)) ?? blanks[blanks.length - 1];
    target.focus({ preventScroll: true });
    const end = target.value.length;
    target.setSelectionRange(end, end);
  }

  /** Alt+H: fill the first blank that is not right yet with its word. */
  hint(i: number): void {
    const blanks = this.inputs(i);
    const k = blanks.findIndex((b) => !wordMatches(this.wordOf(i, b), b.value));
    if (k < 0) return;
    const b = blanks[k];
    b.value = this.wordOf(i, b);
    blankWidth(b, b.value);
    if (!this.hinted.has(i)) this.hinted.set(i, new Set());
    this.hinted.get(i)!.add(k);
    b.classList.add('hinted');
    (blanks[k + 1] ?? b).focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ keys

  private onInput(input: HTMLInputElement, i: number): void {
    if (!input.matches('input.md-blank')) return;
    input.classList.remove('bad', 'rev');
    // A space (or a pasted phrase) spills over into the next blanks.
    if (/\s/.test(input.value)) {
      const [first, ...rest] = input.value.split(/\s+/);
      input.value = first;
      const blanks = this.inputs(i);
      let k = blanks.indexOf(input);
      for (const word of rest.filter(Boolean)) {
        k += 1;
        if (!blanks[k]) break;
        blanks[k].value = word;
        blanks[k].classList.remove('ok', 'bad');
        blankWidth(blanks[k], this.wordOf(i, blanks[k]));
      }
      const next = blanks[Math.min(k + (rest.length && !rest[rest.length - 1] ? 1 : 0), blanks.length - 1)];
      next?.focus({ preventScroll: true });
    }
    // No marks while typing: the line is judged as a whole when it is submitted.
    input.classList.remove('ok', 'bad');
    this.renderDiff(i, false);
    blankWidth(input, this.wordOf(i, input));
  }

  private onKey(e: KeyboardEvent, i: number): void {
    if (e.isComposing) return;
    const input = e.target as HTMLInputElement;
    if (!input.matches?.('input.md-blank')) {
      // Focus on a submitted line: its keys still work.
      const action = actionFor(e);
      if (action) {
        e.preventDefault();
        this.host.key(action);
      } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (e.key === 'Enter') this.host.check(i);
        else this.host.key('next');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.host.key('prev');
      }
      return;
    }
    const blanks = this.inputs(i);
    const k = blanks.indexOf(input);
    const caretStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const caretEnd = input.selectionStart === input.value.length;

    if (isTypeThrough(e)) {
      e.preventDefault();
      input.setRangeText(e.key, input.selectionStart ?? 0, input.selectionEnd ?? 0, 'end');
      this.onInput(input, i);
      return;
    }
    const action = actionFor(e);
    if (action) {
      e.preventDefault();
      this.host.key(action);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.host.check(i);
      return;
    }
    const move = (to: number, atEnd: boolean) => {
      const target = blanks[to];
      if (!target) return false;
      target.focus({ preventScroll: true });
      const pos = atEnd ? target.value.length : 0;
      target.setSelectionRange(pos, pos);
      return true;
    };
    if (e.key === ' ' && !e.shiftKey) {
      e.preventDefault();
      move(k + 1, false);
      return;
    }
    // Tab moves word by word too; past the last word it goes on to the next line (Shift+Tab: back).
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (!move(k - 1, true) && i > 0) this.host.key('prev');
      } else if (!move(k + 1, false) && i + 1 < this.lines.length) this.host.key('next');
      return;
    }
    if (e.key === 'Backspace' && !input.value) {
      e.preventDefault();
      move(k - 1, true);
      return;
    }
    if (e.key === 'ArrowLeft' && caretStart && !e.shiftKey && move(k - 1, true)) e.preventDefault();
    if (e.key === 'ArrowRight' && caretEnd && !e.shiftKey && move(k + 1, false)) e.preventDefault();
    if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      this.host.key('prev');
    }
    if (e.key === 'ArrowDown' && i + 1 < this.lines.length) {
      e.preventDefault();
      this.host.key('next');
    }
  }
}
