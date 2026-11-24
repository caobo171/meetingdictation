/**
 * The panel's answer box: one blank per spoken word of the current sentence, as on
 * dictation sites. The blanks are never marked right or wrong; the panel shows the whole
 * sentence under them once it is checked. A word shown by a hint or Show answer counts as
 * a mistake. Words a learner is never asked for ("uh", "hi",
 * "then") are printed as text between the blanks.
 *
 * value joins every word slot with single spaces, shown words included, so the
 * sentence grades exactly like the old text box and saved answers restore into
 * the same slots.
 */

import { blankParts, wordMatches, type BlankPart } from '@md/core';

import { actionFor, isTypeThrough, type KeyAction } from './keys';

export interface WordBoxHost {
  key(action: KeyAction): void;
  check(): void;
  /** The learner typed: an earlier check no longer describes the blanks. */
  changed(): void;
}

export class WordBox {
  readonly el: HTMLDivElement;
  private parts: BlankPart[] = [];
  /** Per part: its blank, or null for a shown word / punctuation. */
  private blanks: (HTMLInputElement | null)[] = [];
  private shown = new Set<number>();

  constructor(private host: WordBoxHost) {
    this.el = document.createElement('div');
    this.el.className = 'words';
  }

  /** Lay out the blanks for a sentence, with what was typed before (a value from this box). */
  setSentence(text: string, typed = ''): void {
    this.parts = blankParts(text);
    this.shown.clear();
    this.el.replaceChildren();
    this.blanks = this.parts.map((p, k) => {
      if (!p.word || p.filler) {
        const span = document.createElement('span');
        span.className = 'w-text';
        span.textContent = `${p.pre}${p.word}${p.post}`;
        this.el.append(span);
        return null;
      }
      const slot = document.createElement('span');
      slot.className = 'w-slot';
      const row = document.createElement('span');
      row.className = 'w-row';
      if (p.pre) row.append(p.pre);
      const input = document.createElement('input');
      input.className = 'w-blank';
      input.spellcheck = false;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.style.width = `${Math.max(2.2, p.word.length * 0.62 + 1.2)}em`;
      input.addEventListener('keydown', (e) => this.onKey(e, k));
      input.addEventListener('input', () => this.onInput(k));
      row.append(input);
      if (p.post) row.append(p.post);
      slot.append(row);
      this.el.append(slot);
      return input;
    });
    this.value = typed;
  }

  /** Every word slot in order, shown words included, single spaces between. */
  get value(): string {
    // Empty blanks stay as empty slots, so a saved value restores into the same blanks.
    return this.parts
      .map((p, k) => (!p.word ? null : this.blanks[k] ? this.blanks[k]!.value.trim() : p.word))
      .filter((v): v is string => v !== null)
      .join(' ');
  }

  set value(typed: string) {
    const slots = this.parts.map((p, k) => (p.word ? k : -1)).filter((k) => k >= 0);
    const tokens = typed.split(' ');
    // A value from this box has one token per word slot; older free text just fills the blanks in order.
    const aligned = tokens.length === slots.length;
    const free = typed.trim() ? typed.trim().split(/\s+/) : [];
    let f = 0;
    slots.forEach((k, n) => {
      const b = this.blanks[k];
      if (!b) {
        if (!aligned && free[f] && wordMatches(this.parts[k].word, free[f])) f += 1;
        return;
      }
      b.value = aligned ? tokens[n] ?? '' : free[f++] ?? '';
      b.classList.remove('rev');
    });
  }

  /** The sentence as typed, with the words shown by a hint left out (they score as mistakes). */
  get honestValue(): string {
    return this.parts
      .map((p, k) => {
        if (!p.word) return null;
        const b = this.blanks[k];
        if (!b) return p.word;
        return this.shown.has(k) ? '' : b.value.trim();
      })
      .filter((v): v is string => v !== null)
      .join(' ');
  }

  get revealedCount(): number {
    return this.shown.size;
  }

  get isEmpty(): boolean {
    return this.blanks.every((b) => !b || !b.value.trim());
  }

  /** Show every word (Show answer). */
  revealAll(): void {
    this.blanks.forEach((b, k) => {
      if (b && !wordMatches(this.parts[k].word, b.value)) this.reveal(k, false);
    });
  }

  /** Hint: show the first word that is not right yet. */
  hint(): void {
    const k = this.blanks.findIndex((b, j) => b && !wordMatches(this.parts[j].word, b.value));
    if (k >= 0) this.reveal(k);
  }

  private reveal(k: number, focusNext = true): void {
    const b = this.blanks[k];
    if (!b) return;
    b.value = this.parts[k].word;
    this.shown.add(k);
    b.classList.add('rev');
    this.host.changed();
    if (focusNext) this.focusFrom(k + 1);
  }

  focus(): void {
    const first = this.blanks.find((b) => b && !b.value.trim()) ?? [...this.blanks].reverse().find(Boolean);
    first?.focus({ preventScroll: true });
  }

  private focusFrom(k: number): void {
    for (let j = k; j < this.blanks.length; j++) {
      const b = this.blanks[j];
      if (b && !b.value.trim()) return b.focus({ preventScroll: true });
    }
    this.focus();
  }

  private move(k: number, dir: 1 | -1, atEnd: boolean): boolean {
    for (let j = k + dir; j >= 0 && j < this.blanks.length; j += dir) {
      const b = this.blanks[j];
      if (!b) continue;
      b.focus({ preventScroll: true });
      const pos = atEnd ? b.value.length : 0;
      b.setSelectionRange(pos, pos);
      return true;
    }
    return false;
  }

  private onInput(k: number): void {
    const b = this.blanks[k]!;
    this.shown.delete(k);
    b.classList.remove('rev');
    // Several words typed or pasted at once: spread them over the next blanks.
    if (/\s/.test(b.value.trim())) {
      const words = b.value.trim().split(/\s+/);
      b.value = words.shift() ?? '';
      let j = k;
      for (const w of words) {
        do j += 1;
        while (j < this.blanks.length && !this.blanks[j]);
        const next = this.blanks[j];
        if (!next) break;
        next.value = w;
      }
      this.move(j - 1, 1, true) || b.focus();
    } else if (b.value.endsWith(' ')) {
      b.value = b.value.trimEnd();
      this.move(k, 1, false);
    }
    this.host.changed();
  }

  private onKey(e: KeyboardEvent, k: number): void {
    if (e.isComposing) return;
    const b = e.target as HTMLInputElement;
    if (isTypeThrough(e)) {
      e.preventDefault();
      b.setRangeText(e.key, b.selectionStart ?? 0, b.selectionEnd ?? 0, 'end');
      this.onInput(k);
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
      this.host.check();
      return;
    }
    if ((e.key === ' ' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      if (!this.move(k, 1, false) && e.key === 'Tab') this.host.key('next');
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      if (!this.move(k, -1, true)) this.host.key('prev');
      return;
    }
    const caretStart = b.selectionStart === 0 && b.selectionEnd === 0;
    const caretEnd = b.selectionStart === b.value.length;
    if (e.key === 'Backspace' && !b.value) {
      e.preventDefault();
      this.move(k, -1, true);
    } else if (e.key === 'ArrowLeft' && caretStart && !e.shiftKey && this.move(k, -1, true)) e.preventDefault();
    else if (e.key === 'ArrowRight' && caretEnd && !e.shiftKey && this.move(k, 1, false)) e.preventDefault();
  }
}
