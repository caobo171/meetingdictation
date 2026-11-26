'use client';

/** What the browser gets back for a card (see CardView in lib/cards.ts). */
export interface Explanation {
  meaning: string;
  focus: string;
  phrases: { text: string; meaning: string }[];
  listening: string;
}

export interface CardView {
  id: string;
  sourceKey: string;
  sourceTitle: string;
  sourceUrl: string | null;
  segIndex: number;
  start: number | null;
  end: number | null;
  text: string;
  before: string | null;
  after: string | null;
  speaker: string | null;
  missed: string[];
  focus: string | null;
  explanation: Explanation | null;
  due: string;
  state: number;
  reps: number;
  lapses: number;
  intervals: Record<1 | 2 | 3 | 4, string>;
}

export class CardRequestError extends Error {}

export async function cardRequest(body: Record<string, unknown>): Promise<CardView | null> {
  const res = await fetch('/api/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { card?: CardView | null; message?: string };
  if (!res.ok) throw new CardRequestError(data.message ?? 'Something went wrong.');
  return data.card ?? null;
}

/** The text the learner selected inside `root`, if any (a phrase to ask the AI about). */
export function selectionIn(root: HTMLElement | null): string {
  const sel = typeof window === 'undefined' ? null : window.getSelection();
  if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return '';
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return '';
  return sel.toString().replace(/\s+/g, ' ').trim().slice(0, 200);
}
