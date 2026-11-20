/**
 * Captions in, dictation segments out.
 *
 * Recorders cut captions for the screen, not for the ear: Loom's are 2-5 word
 * fragments, YouTube's auto captions are word runs with no punctuation. A
 * dictation segment should be one sentence (or one breath) from one speaker,
 * so fragments are merged until a sentence ends, the speaker changes, the
 * speaker pauses, or the segment gets too long to hold in your head.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export type Segment = Cue;

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

/** Strip WebVTT markup and pull out the speaker (`<v Name>`, or Zoom's `Name: text`). */
export function cleanCueText(raw: string): { text: string; speaker?: string } {
  let speaker: string | undefined;
  let text = raw || '';
  const voice = text.match(/<v(?:\.[^\s>]*)?\s+([^>]+)>/);
  if (voice) speaker = voice[1].trim();
  text = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
  if (!speaker) {
    // Zoom / Otter style "Cao Nguyen: hello". Short and capitalised, so a
    // sentence like "Note: this matters" is not mistaken for a speaker... mostly.
    const named = text.match(/^([A-Z][\p{L}.'-]*(?: [A-Z][\p{L}.'-]*){0,3}):\s+(.+)$/u);
    if (named && named[1].length <= 40) {
      speaker = named[1];
      text = named[2];
    }
  }
  // Speaker-change markers some captioners put in the text itself.
  text = text.replace(/^(?:>>|-)\s*/, '');
  return { text, speaker };
}

const TERMINAL = /[.!?…]["')\]]*$/;
const MAX_WORDS = 24;
const MAX_SECONDS = 12;
const PAUSE_BREAK = 1.2;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function buildSegments(input: Cue[]): Segment[] {
  const cues = input
    .map((c) => ({ ...c, ...cleanCueTextKeep(c) }))
    .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end))
    .sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cur: Segment | null = null;

  const close = () => {
    if (cur && cur.text) out.push(cur);
    cur = null;
  };

  for (const cue of cues) {
    if (cur) {
      const c: Segment = cur;
      const speakerChanged = !!cue.speaker && !!c.speaker && cue.speaker !== c.speaker;
      const paused = cue.start - c.end > PAUSE_BREAK;
      const tooLong = words(c.text) + words(cue.text) > MAX_WORDS || cue.end - c.start > MAX_SECONDS;
      if (speakerChanged || paused || tooLong) close();
    }
    if (!cur) {
      cur = { start: cue.start, end: cue.end, text: cue.text, speaker: cue.speaker };
    } else {
      cur.text = `${cur.text} ${cue.text}`;
      cur.end = Math.max(cur.end, cue.end);
      if (!cur.speaker && cue.speaker) cur.speaker = cue.speaker;
    }
    // A finished sentence ends the segment, unless it is a stub like "Hello."
    // that is better heard together with what follows.
    if (TERMINAL.test(cur.text) && words(cur.text) >= 4) close();
  }
  close();
  return out;
}

/** Cues from a track may still carry markup; cues from adapters are already clean. */
function cleanCueTextKeep(c: Cue): { text: string; speaker?: string } {
  const cleaned = cleanCueText(c.text);
  return { text: cleaned.text, speaker: c.speaker ?? cleaned.speaker };
}

/** "01:02:03.450", "02:03,4", "2:03", "75.5" → seconds. NaN when unreadable. */
export function parseClock(value: string): number {
  const m = value.trim().match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2}(?:[.,]\d+)?)$/);
  if (!m) return Number.NaN;
  const parts = [m[1], m[2], m[3]].filter((p) => p !== undefined).map((p) => Number(p!.replace(',', '.')));
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * Read a .vtt or .srt file (what Zoom, Teams, Meet, Loom and YouTube all let
 * you download), or a plain "00:32 text" transcript, into cues.
 */
export function parseSubtitleFile(content: string): Cue[] {
  const text = content.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const cues: Cue[] = [];
  const TIME = /((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;

  if (TIME.test(text)) {
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split('\n');
      const at = lines.findIndex((l) => TIME.test(l));
      if (at < 0) continue;
      const m = lines[at].match(TIME)!;
      const body = lines.slice(at + 1).join(' ').trim();
      if (!body) continue;
      const { text: t, speaker } = cleanCueText(body);
      cues.push({ start: parseClock(m[1]), end: parseClock(m[2]), text: t, speaker });
    }
    return cues;
  }

  // Plain transcript: lines that start with a timestamp. Each runs until the next.
  const rows: { start: number; text: string }[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\[?((?:\d+:)?\d{1,2}:\d{2})\]?\s*[-–]?\s*(.*)$/);
    // A timestamp alone on its line (YouTube's "Show transcript", copied) starts a row; its text follows.
    if (m) rows.push({ start: parseClock(m[1]), text: m[2].trim() });
    else if (line.trim() && rows.length) rows[rows.length - 1].text = `${rows[rows.length - 1].text} ${line.trim()}`.trim();
  }
  return rowsToCues(rows.filter((r) => r.text));
}

/** Rows that only know when they start (Loom's list, YouTube's panel) → cues ending at the next row. */
export function rowsToCues(rows: { start: number; text: string; speaker?: string }[], lastEnd?: number): Cue[] {
  return rows.map((r, i) => {
    // The last row has no successor; the video's end may be minutes of outro away, so cap it.
    const estimate = r.start + Math.max(3, words(r.text) * 0.6);
    const next = rows[i + 1]?.start;
    const end = next ?? (lastEnd && lastEnd > r.start ? Math.min(lastEnd, estimate + 2) : estimate);
    const { text, speaker } = cleanCueText(r.text);
    return { start: r.start, end, text, speaker: r.speaker ?? speaker };
  });
}
