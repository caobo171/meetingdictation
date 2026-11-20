import { z } from 'zod';

import { isDone, mergeResults, type Results } from '@md/core';

import { db } from '@/lib/db';

export type { Result, Results } from '@md/core';

const resultSchema = z.object({
  typed: z.string().max(4000).default(''),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  revealed: z.boolean(),
});

export const progressInput = z.object({
  key: z.string().min(1).max(500),
  title: z.string().max(300).default('Untitled recording'),
  url: z.string().max(2000).optional().nullable(),
  source: z.enum(['web', 'extension']),
  site: z.string().max(100).optional().nullable(),
  fp: z.string().max(200),
  total: z.number().int().min(1).max(20000),
  index: z.number().int().min(0),
  results: z.record(z.string(), resultSchema),
  /** The learner's local date, so a streak follows their day, not the server's. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Seconds of audio played since the last save. */
  playedSeconds: z.number().min(0).max(3600).default(0),
});
export type ProgressInput = z.infer<typeof progressInput>;

function summary(results: Results) {
  const all = Object.values(results);
  return {
    done: all.filter(isDone).length,
    scoreAvg: all.length ? all.reduce((a, r) => a + r.score, 0) / all.length : 0,
  };
}

function parse(json: string): Results {
  try {
    return JSON.parse(json) as Results;
  } catch {
    return {};
  }
}

export async function saveProgress(userId: string, input: ProgressInput) {
  const existing = await db.progress.findUnique({ where: { userId_key: { userId, key: input.key } } });
  const sameTranscript = existing && existing.fp === input.fp;
  const before = sameTranscript ? parse(existing.results) : {};
  const merged = mergeResults(before, input.results);
  const { done, scoreAvg } = summary(merged);
  const newlyDone = Math.max(0, done - (sameTranscript ? existing.done : 0));

  const data = {
    title: input.title,
    url: input.url ?? null,
    source: input.source,
    site: input.site ?? null,
    fp: input.fp,
    total: input.total,
    index: Math.min(input.index, input.total - 1),
    results: JSON.stringify(merged),
    done,
    scoreAvg,
  };
  const row = await db.progress.upsert({
    where: { userId_key: { userId, key: input.key } },
    update: data,
    create: { userId, key: input.key, ...data },
  });

  const seconds = Math.round(input.playedSeconds);
  if (newlyDone || seconds) {
    const day = input.day ?? new Date().toISOString().slice(0, 10);
    await db.activityDay.upsert({
      where: { userId_day: { userId, day } },
      update: { segments: { increment: newlyDone }, seconds: { increment: seconds } },
      create: { userId, day, segments: newlyDone, seconds },
    });
  }
  return { index: row.index, results: merged, done, total: row.total };
}

export async function loadProgress(userId: string, key: string) {
  const row = await db.progress.findUnique({ where: { userId_key: { userId, key } } });
  if (!row) return null;
  return { fp: row.fp, index: row.index, results: parse(row.results), done: row.done, total: row.total };
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days with practice, ending today (or yesterday: today is not over yet). */
export function streakFrom(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = shiftDay(day, -1);
  }
  return n;
}

export async function dashboardStats(userId: string, today: string) {
  const [days, progress] = await Promise.all([
    db.activityDay.findMany({ where: { userId }, orderBy: { day: 'desc' }, take: 400 }),
    db.progress.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
  ]);
  const active = new Set(days.filter((d) => d.segments > 0 || d.seconds >= 60).map((d) => d.day));
  const segments = progress.reduce((a, p) => a + p.done, 0);
  const seconds = days.reduce((a, d) => a + d.seconds, 0);
  const scored = progress.filter((p) => p.done > 0);
  const accuracy = scored.length
    ? scored.reduce((a, p) => a + p.scoreAvg * p.done, 0) / Math.max(1, scored.reduce((a, p) => a + p.done, 0))
    : 0;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const day = shiftDay(today, i - 13);
    const row = byDay.get(day);
    return { day, segments: row?.segments ?? 0, seconds: row?.seconds ?? 0 };
  });
  return {
    streak: streakFrom(active, today),
    segments,
    minutes: Math.round(seconds / 60),
    accuracy,
    last14,
    progress,
  };
}
