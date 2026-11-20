/**
 * "Type in the transcript": every line of the site's own transcript (Loom's
 * list, YouTube's panel) becomes a row of blanks, one per spoken word, with
 * punctuation and the speaker's name left showing. The learner types straight
 * into the line, as on WELE's podcast page:
 *
 *   Space / Tab   next blank        Backspace on an empty blank   previous one
 *   Enter         check the line; Enter on a finished line plays the next one
 *   1 / 2 / 3     play the line, back / forward 2 s (Ctrl/⌘ + digit types it)
 *   Alt+H hint    Alt+A answer      Alt+← / Alt+→ previous / next line
 *
 * The site's own text element is hidden, not removed, and the blanks sit next
 * to it, so the site's own rendering is never fought. If the site re-renders a
 * row, a mutation observer puts the blanks back with what was typed.
 */

import { blankParts, wordMatches, type BlankPart } from '@md/core';
import type { TranscriptLine } from './sources';

export interface BlankHost {
  /** The learner moved into line i (click or keyboard). */
  select(i: number): void;
  /** Enter on line i. */
  check(i: number): void;
  togglePlay(): void;
  nudge(delta: number): void;
  act(name: 'hint' | 'answer' | 'prev' | 'next' | 'loop'): void;
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
.md-line { display: block; line-height: 2.05; filter: none !important; user-select: text; cursor: text; }
.md-line.md-cur { background: rgba(79, 70, 229, .07); box-shadow: -3px 0 0 #6366f1; border-radius: 4px; }
.md-line .md-who { font-weight: 700; margin-right: 6px; }
.md-line .md-fill { opacity: .5; font-style: italic; }
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
.md-line .md-mark { margin-left: 6px; font-size: 12px; color: #15803d; font-weight: 700; }
`;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Width of text in this input's own font (the site's font is proportional, so `ch` overshoots). */
function textWidth(input: HTMLInputElement, text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx || !text) return 0;
  measureCtx.font = getComputedStyle(input).font;
  return measureCtx.measureText(text).width;
}

/** Size a blank to its word (so the gap hints at the length) or to what was typed, if longer. */
function blankWidth(input: HTMLInputElement, word: string): void {
  if (!input.isConnected) return; // sized once it is on the page
  const px = Math.max(textWidth(input, word), textWidth(input, input.value), textWidth(input, 'mm'));
  input.style.width = `${Math.ceil(px) + 2}px`;
}

export class InlineBlanks {
  private lines: TranscriptLine[] = [];
  private parts: BlankPart[][] = [];
  private nodes: (HTMLElement | null)[] = [];
  private current = -1;
  private observer: MutationObserver | null = null;
  private repairTimer = 0;
  private hinted = new Map<number, Set<number>>();

  constructor(
    private host: BlankHost,
    private stateOf: (i: number) => LineState | undefined,
    /** The site's lines as they are now, to find a row the site replaced. */
    private currentLines: () => TranscriptLine[],
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
    this.lines = lines;
    this.parts = lines.map((l) => blankParts(l.text));
    this.nodes = lines.map(() => null);
    lines.forEach((_, i) => this.render(i));
    this.observer = new MutationObserver(() => {
      clearTimeout(this.repairTimer);
      this.repairTimer = window.setTimeout(() => this.repair(), 250);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    clearTimeout(this.repairTimer);
    for (const node of this.nodes) node?.remove();
    for (const l of this.lines) l.el.removeAttribute('data-md-src');
    document.querySelectorAll('.md-line').forEach((n) => n.remove());
    document.querySelectorAll('[data-md-src]').forEach((n) => n.removeAttribute('data-md-src'));
    this.nodes = [];
    this.lines = [];
    this.current = -1;
    this.hinted.clear();
  }

  get attached(): boolean {
    return this.lines.length > 0;
  }

  // ------------------------------------------------------------ rendering

  private render(i: number): void {
    const line = this.lines[i];
    this.nodes[i]?.remove();
    const box = document.createElement('div');
    box.className = 'md-line';
    box.dataset.mdI = String(i);
    if (line.speakerShown && line.speaker) {
      const who = document.createElement('span');
      who.className = 'md-who';
      who.textContent = line.speaker;
      box.append(who);
    }
    const state = this.stateOf(i);
    const typed = state ? state.typed.split(' ') : [];
    let k = 0;
    this.parts[i].forEach((p, w) => {
      if (p.pre) box.append(p.pre);
      if (p.word && p.filler) {
        const f = document.createElement('span');
        f.className = 'md-fill';
        f.textContent = p.word;
        box.append(f);
      } else if (p.word) {
        const input = document.createElement('input');
        input.className = 'md-blank';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('aria-label', `Word ${k + 1}`);
        input.dataset.w = String(w);
        const v = typed[k];
        input.value = v && v !== '_' ? v : '';
        blankWidth(input, p.word);
        box.append(input);
        k += 1;
      }
      if (p.post) box.append(p.post);
      box.append(' ');
    });
    const mark = document.createElement('span');
    mark.className = 'md-mark';
    box.append(mark);

    // The row itself is a "seek to this time" button on Loom: keep our clicks and keys to ourselves.
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick'] as const) {
      box.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'click' && !(e.target as HTMLElement).matches('input')) this.focus(i, true);
      });
    }
    for (const type of ['keyup', 'keypress'] as const) box.addEventListener(type, (e) => e.stopPropagation());
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      this.onKey(e, i);
    });
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
  }

  /** The site re-rendered: put back any blanks it dropped. */
  private repair(): void {
    this.lines.forEach((line, i) => {
      const node = this.nodes[i];
      const intact = node?.isConnected && line.el.isConnected && line.el.nextElementSibling === node && line.el.hasAttribute('data-md-src');
      if (intact) return;
      if (!line.el.isConnected) {
        // Row element replaced: find the new one by its start time.
        const fresh = this.findLine(line.start);
        if (!fresh) return;
        this.lines[i] = { ...line, el: fresh.el };
      }
      const hadFocus = node?.contains(document.activeElement);
      const drafts = this.inputs(i).map((b) => b.value);
      this.render(i);
      this.inputs(i).forEach((b, k) => {
        if (drafts[k]) b.value = drafts[k];
      });
      if (hadFocus) this.focus(i);
    });
  }

  private findLine(start: number): TranscriptLine | undefined {
    return this.currentLines().find((l) => Math.abs(l.start - start) < 0.01);
  }

  private inputs(i: number): HTMLInputElement[] {
    return [...(this.nodes[i]?.querySelectorAll<HTMLInputElement>('input.md-blank') ?? [])];
  }

  private wordOf(i: number, input: HTMLInputElement): string {
    return this.parts[i][Number(input.dataset.w)].word;
  }

  // ------------------------------------------------------------ state

  /** What is typed in line i, "_" for an empty blank. */
  typed(i: number): string {
    return this.inputs(i)
      .map((b) => b.value.trim().replace(/\s+/g, '') || '_')
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
      b.classList.toggle('ok', right && !hinted?.has(k));
      b.classList.toggle('hinted', right && !!hinted?.has(k));
      b.classList.toggle('bad', !right && !!state?.checked && !state.revealed && !!b.value.trim());
      if (!right && state?.revealed) {
        b.value = word;
        b.classList.add('rev');
        blankWidth(b, word);
      } else if (!state?.revealed) b.classList.remove('rev');
    });
    const mark = this.nodes[i]?.querySelector('.md-mark');
    if (mark) mark.textContent = allRight && state?.checked ? '✓' : '';
  }

  setCurrent(i: number, scroll: boolean): void {
    if (this.current >= 0) this.nodes[this.current]?.classList.remove('md-cur');
    this.current = i;
    const node = this.nodes[i];
    node?.classList.add('md-cur');
    if (scroll && node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Put the caret in line i: the first blank that is still wrong, else the last one. */
  focus(i: number, keepIfInside = false): void {
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
        blankWidth(blanks[k], this.wordOf(i, blanks[k]));
      }
      const next = blanks[Math.min(k + (rest.length && !rest[rest.length - 1] ? 1 : 0), blanks.length - 1)];
      next?.focus({ preventScroll: true });
    }
    blankWidth(input, this.wordOf(i, input));
    // Instant green when a word is right, like ticking it off.
    input.classList.toggle('ok', wordMatches(this.wordOf(i, input), input.value));
  }

  private onKey(e: KeyboardEvent, i: number): void {
    if (e.isComposing) return;
    const input = e.target as HTMLInputElement;
    if (!input.matches?.('input.md-blank')) return;
    const blanks = this.inputs(i);
    const k = blanks.indexOf(input);
    const caretStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const caretEnd = input.selectionStart === input.value.length;

    const digit = e.key === '1' || e.key === '2' || e.key === '3';
    if (digit && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      input.setRangeText(e.key, input.selectionStart ?? 0, input.selectionEnd ?? 0, 'end');
      this.onInput(input, i);
      return;
    }
    if (digit && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (e.key === '1') this.host.togglePlay();
      else this.host.nudge(e.key === '2' ? -2 : 2);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.host.check(i);
      return;
    }
    if (e.altKey) {
      const map: Record<string, 'hint' | 'answer' | 'loop' | 'prev' | 'next'> = {
        KeyH: 'hint', KeyA: 'answer', KeyL: 'loop', ArrowLeft: 'prev', ArrowRight: 'next',
      };
      const act = map[e.code];
      if (act) {
        e.preventDefault();
        this.host.act(act);
      }
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
    if (e.key === 'Backspace' && !input.value) {
      e.preventDefault();
      move(k - 1, true);
      return;
    }
    if (e.key === 'ArrowLeft' && caretStart && !e.shiftKey && move(k - 1, true)) e.preventDefault();
    if (e.key === 'ArrowRight' && caretEnd && !e.shiftKey && move(k + 1, false)) e.preventDefault();
    if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      this.host.act('prev');
    }
    if (e.key === 'ArrowDown' && i + 1 < this.lines.length) {
      e.preventDefault();
      this.host.act('next');
    }
  }
}
