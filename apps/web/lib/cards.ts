import 'server-only';

import { mergeMissed } from '@md/core';
import type { Card as CardRow, User } from '@prisma/client';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { z } from 'zod';

import { db } from '@/lib/db';
import { explainSentence, ExplainUnavailable, langFromHeader, type Explanation } from '@/lib/explain';
import { isPro } from '@/lib/polar';

/**
 * Flashcards: one per sentence a learner missed in dictation or asked the AI
 * about, from the website or the extension. Scheduling is FSRS, as in WELE's
 * review queue: Again / Hard / Good / Easy, the next interval shown on each.
 */

const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

/** AI explanations a learner can ask for per UTC day. A cached one is free. */
export const EXPLAIN_LIMIT = { free: 10, pro: 200 };

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
  /** Next interval for each rating (1 Again … 4 Easy), e.g. "10m", "3d". */
  intervals: Record<1 | 2 | 3 | 4, string>;
}

function toFsrs(c: CardRow): FsrsCard {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview ?? undefined,
  };
}

function fromFsrs(f: FsrsCard) {
  return {
    due: f.due,
    stability: f.stability,
    difficulty: f.difficulty,
    elapsedDays: f.elapsed_days,
    scheduledDays: f.scheduled_days,
    learningSteps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state,
    lastReview: f.last_review ?? null,
  };
}

export function formatInterval(ms: number): string {
  const m = ms / 60_000;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function cardView(c: CardRow, now = new Date()): CardView {
  const preview = scheduler.repeat(toFsrs(c), now);
  const intervals = Object.fromEntries(GRADES.map((g) => [g, formatInterval(preview[g].card.due.getTime() - now.getTime())])) as CardView['intervals'];
  let explanation: Explanation | null = null;
  try {
    explanation = c.explanation ? (JSON.parse(c.explanation) as Explanation) : null;
  } catch {
    explanation = null;
  }
  return {
    id: c.id,
    sourceKey: c.sourceKey,
    sourceTitle: c.sourceTitle,
    sourceUrl: c.sourceUrl,
    segIndex: c.segIndex,
    start: c.start,
    end: c.end,
    text: c.text,
    before: c.before,
    after: c.after,
    speaker: c.speaker,
    missed: JSON.parse(c.missed) as string[],
    focus: c.focus,
    explanation,
    due: c.due.toISOString(),
    state: c.state,
    reps: c.reps,
    lapses: c.lapses,
    intervals,
  };
}

// ------------------------------------------------------------ input

const str = (max: number) => z.string().trim().max(max);

/** Where a sentence comes from and the sentence itself, as the dictation player knows it. */
export const sentenceInput = z.object({
  sourceKey: str(500).min(1),
  sourceTitle: str(300).min(1),
  sourceUrl: str(2000).nullish(),
  segIndex: z.number().int().min(0).max(100_000),
  start: z.number().min(0).max(1e6).nullish(),
  end: z.number().min(0).max(1e6).nullish(),
  text: str(2000).min(1),
  before: str(2000).nullish(),
  after: str(2000).nullish(),
  speaker: str(200).nullish(),
});
export type SentenceInput = z.infer<typeof sentenceInput>;

const missInput = sentenceInput.extend({ missed: z.array(str(80)).max(80) });
const explainInput = z.union([
  z.object({ id: z.string().min(1).max(40), focus: str(200).nullish(), force: z.boolean().optional() }),
  sentenceInput.extend({ missed: z.array(str(80)).max(80).optional(), focus: str(200).nullish(), force: z.boolean().optional() }),
]);
const rateInput = z.object({ id: z.string().min(1).max(40), rating: z.number().int().min(1).max(4) });
const idInput = z.object({ id: z.string().min(1).max(40) });

// ------------------------------------------------------------ store

function sentenceData(s: SentenceInput) {
  return {
    sourceTitle: s.sourceTitle,
    sourceUrl: s.sourceUrl ?? null,
    start: s.start ?? null,
    end: s.end ?? null,
    text: s.text,
    before: s.before ?? null,
    after: s.after ?? null,
    speaker: s.speaker ?? null,
  };
}

/**
 * Keep a sentence the learner got wrong. Missed words add up over attempts; a
 * card they already scheduled for later comes back now, since they missed it again.
 */
export async function saveMiss(userId: string, s: SentenceInput & { missed: string[] }, now = new Date()): Promise<CardRow> {
  const key = { userId_sourceKey_segIndex: { userId, sourceKey: s.sourceKey, segIndex: s.segIndex } };
  const existing = await db.card.findUnique({ where: key });
  if (!existing) {
    return db.card.create({
      data: { userId, sourceKey: s.sourceKey, segIndex: s.segIndex, ...sentenceData(s), missed: JSON.stringify(s.missed), ...fromFsrs(createEmptyCard(now)) },
    });
  }
  const missed = mergeMissed(JSON.parse(existing.missed) as string[], s.missed);
  return db.card.update({
    where: { id: existing.id },
    data: { ...sentenceData(s), missed: JSON.stringify(missed), ...(existing.due > now && s.missed.length ? { due: now } : {}) },
  });
}

async function useExplainQuota(user: Pick<User, 'id' | 'lifetime' | 'proUntil'>): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const limit = isPro(user) ? EXPLAIN_LIMIT.pro : EXPLAIN_LIMIT.free;
  const row = await db.aiDay.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: { userId: user.id, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count <= limit) return true;
  await db.aiDay.update({ where: { id: row.id }, data: { count: { decrement: 1 } } });
  return false;
}

export class CardError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Explain a sentence (or one phrase of it) with AI and keep the answer on its
 * card, creating the card if the learner had none for it yet.
 */
export async function explainCard(userId: string, input: z.infer<typeof explainInput>, acceptLanguage: string | null): Promise<CardRow> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new CardError('Sign in first.', 401);
  const lang = user.explainLang ?? langFromHeader(acceptLanguage);
  if (!user.explainLang) await db.user.update({ where: { id: userId }, data: { explainLang: lang } });

  let card: CardRow | null;
  if ('id' in input) {
    card = await db.card.findFirst({ where: { id: input.id, userId } });
    if (!card) throw new CardError('Card not found.', 404);
  } else {
    card = await saveMiss(userId, { ...input, missed: input.missed ?? [] });
  }

  const focus = input.focus?.trim() || null;
  const fresh = card.explanation && card.explainLang === lang && (focus === null || focus === card.focus);
  if (fresh && !input.force) return card;

  if (!(await useExplainQuota(user))) {
    throw new CardError(
      isPro(user)
        ? `You have used today's ${EXPLAIN_LIMIT.pro} AI explanations. More tomorrow.`
        : `Free accounts get ${EXPLAIN_LIMIT.free} AI explanations a day. Pro raises it to ${EXPLAIN_LIMIT.pro}.`,
      429,
    );
  }
  let explanation: Explanation;
  try {
    explanation = await explainSentence({
      text: card.text,
      before: card.before,
      after: card.after,
      speaker: card.speaker,
      missed: JSON.parse(card.missed) as string[],
      focus,
      lang,
    });
  } catch (err) {
    const day = new Date().toISOString().slice(0, 10);
    await db.aiDay.updateMany({ where: { userId, day, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
    if (err instanceof ExplainUnavailable) throw new CardError(err.message, 503);
    console.error('explain failed', err);
    throw new CardError('The explanation failed. Try again in a moment.', 502);
  }
  return db.card.update({
    where: { id: card.id },
    data: { explanation: JSON.stringify(explanation), explainLang: lang, focus },
  });
}

export async function rateCard(userId: string, id: string, rating: Grade, now = new Date()): Promise<CardRow> {
  const card = await db.card.findFirst({ where: { id, userId } });
  if (!card) throw new CardError('Card not found.', 404);
  const next = scheduler.next(toFsrs(card), now, rating);
  return db.card.update({ where: { id }, data: fromFsrs(next.card) });
}

// ------------------------------------------------------------ requests

/**
 * One handler for the website (session cookie) and the extension (bearer token):
 *   { action: "miss", ...sentence, missed }     keep a sentence that was missed
 *   { action: "explain", id | ...sentence, focus? }  explain it with AI, on its card
 *   { action: "rate", id, rating: 1-4 }          FSRS review
 *   { action: "delete", id }
 */
export async function handleCardRequest(userId: string, body: unknown, acceptLanguage: string | null): Promise<Response> {
  const action = (body as { action?: unknown } | null)?.action;
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  try {
    switch (action) {
      case 'miss': {
        const p = missInput.safeParse(body);
        if (!p.success) return json({ message: 'Bad sentence.' }, 400);
        if (!p.data.missed.length) return json({ card: null });
        return json({ card: cardView(await saveMiss(userId, p.data)) });
      }
      case 'explain': {
        const p = explainInput.safeParse(body);
        if (!p.success) return json({ message: 'Bad sentence.' }, 400);
        return json({ card: cardView(await explainCard(userId, p.data, acceptLanguage)) });
      }
      case 'rate': {
        const p = rateInput.safeParse(body);
        if (!p.success) return json({ message: 'Bad rating.' }, 400);
        return json({ card: cardView(await rateCard(userId, p.data.id, p.data.rating as Grade)) });
      }
      case 'delete': {
        const p = idInput.safeParse(body);
        if (!p.success) return json({ message: 'Bad card.' }, 400);
        await db.card.deleteMany({ where: { id: p.data.id, userId } });
        return json({ ok: true });
      }
      default:
        return json({ message: 'Unknown action.' }, 400);
    }
  } catch (err) {
    if (err instanceof CardError) return json({ message: err.message }, err.status);
    throw err;
  }
}

/** Cards due now, oldest first, and how many cards the learner has in all. */
export async function dueCards(userId: string, limit = 100) {
  const now = new Date();
  const [due, dueCount, total] = await Promise.all([
    db.card.findMany({ where: { userId, due: { lte: now } }, orderBy: { due: 'asc' }, take: limit }),
    db.card.count({ where: { userId, due: { lte: now } } }),
    db.card.count({ where: { userId } }),
  ]);
  return { due: due.map((c) => cardView(c, now)), dueCount, total };
}
