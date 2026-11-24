/**
 * Microsoft's OneTranscript list: the transcript beside a Teams recording, on
 * its Stream page and in Teams' Recap. Each row carries the id of its entry in
 * Stream's transcript API (`data-transcript-entry-id`), which is how a row is
 * matched to its start time. The list is virtual: only the rows near the
 * scroll position exist, so a line's row comes and goes as the learner scrolls.
 */

import type { TranscriptLine } from './sources';

export interface Entry {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

/** The text of one entry; the row around it also holds the speaker and time. */
const ROW = '[data-transcript-entry-id][role="listitem"]';

let known: Entry[] = [];
let order = new Map<string, number>();

/** The entries of the transcript on this page, as read from Stream's API. */
export function rememberEntries(entries: Entry[]): void {
  known = entries;
  order = new Map(entries.map((e, k) => [e.id, k]));
}

export function hasOneTranscript(): boolean {
  return !!document.querySelector(ROW);
}

function renderedRows(): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>();
  for (const el of document.querySelectorAll<HTMLElement>(ROW)) {
    const id = el.dataset.transcriptEntryId;
    if (id && !out.has(id)) out.set(id, el);
  }
  return out;
}

function lineOf(e: Entry, el: HTMLElement): TranscriptLine {
  // The row prints the speaker above the text already.
  return { el, id: e.id, start: e.start, end: e.end, text: e.text, speaker: e.speaker, speakerShown: false };
}

/**
 * A line for every entry. A row the list has not drawn yet gets a stand-in
 * element; the blanks move to the real row once it is drawn.
 */
export function entryLines(entries: Entry[] = known): TranscriptLine[] {
  const shown = renderedRows();
  return entries.map((e) => lineOf(e, shown.get(e.id) ?? document.createElement('span')));
}

/** The rows drawn right now. */
export function renderedLines(): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const [id, el] of renderedRows()) {
    const k = order.get(id);
    if (k !== undefined) out.push(lineOf(known[k], el));
  }
  return out;
}

function scroller(from: Element): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
  }
  return null;
}

/**
 * Scroll the list toward entry `id` until the list draws its row: by the
 * height of the rows on screen, or in proportion when none can be placed.
 */
export function scrollTowardEntry(id: string | undefined): void {
  const target = id === undefined ? undefined : order.get(id);
  // Measure the row's list cell: the text element itself is hidden behind the blanks.
  const drawn = [...renderedRows()]
    .map(([rid, el]) => ({ k: order.get(rid), el: el.closest<HTMLElement>('.ms-List-cell') ?? el }))
    .filter((r) => r.k !== undefined) as { k: number; el: HTMLElement }[];
  if (target === undefined || !drawn.length) return;
  const box = scroller(drawn[0].el);
  if (!box) return;
  // Only the rows in view: the list also keeps rows far off screen (its first page), which would skew this.
  const view = box.getBoundingClientRect();
  const inView = drawn.filter(({ el }) => {
    const r = el.getBoundingClientRect();
    return r.bottom > view.top && r.top < view.bottom;
  });
  if (!inView.length) {
    // The list has not drawn where we are yet: jump by proportion, which is safe to repeat.
    box.scrollTop = (target / Math.max(known.length, 1)) * box.scrollHeight - box.clientHeight / 2;
    return;
  }
  const rows = inView.sort((x, y) => x.k - y.k);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = last.el.getBoundingClientRect().top - first.el.getBoundingClientRect().top;
  const perRow = last.k > first.k && span > 0 ? span / (last.k - first.k) : box.scrollHeight / Math.max(known.length, 1);
  const mid = (first.k + last.k) / 2;
  box.scrollTop += (target - mid) * perRow;
}
