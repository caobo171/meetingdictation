import { describe, expect, it } from 'vitest';

import { grade, hasWords, hint } from './src/compare';
import { buildSegments, cleanCueText, parseClock, parseSubtitleFile, rowsToCues } from './src/segments';

describe('grade', () => {
  it('ignores case and punctuation', () => {
    const g = grade("Cool, thanks for doing this, Cal.", 'cool thanks for doing this cal');
    expect(g.passed).toBe(true);
    expect(g.score).toBe(1);
  });

  it('never requires fillers', () => {
    expect(grade('Uh, yes, I did. Uhm. Yeah, okay.', 'yes i did yeah ok').passed).toBe(true);
    expect(grade('Yes I did', 'um yes I did').passed).toBe(true);
  });

  it('accepts contractions and numbers either way', () => {
    expect(grade("It's two o'clock and we're done", 'it is 2 o\'clock and we are done').passed).toBe(true);
    expect(grade('We grew 40% this year', 'we grew 40 percent this year').passed).toBe(true);
  });

  it('marks missing words and places a typo next to the word it replaced', () => {
    const g = grade('putting together the Databricks dashboard', 'putting together the databrick dashboard');
    expect(g.passed).toBe(false);
    const db = g.words.find((w) => w.raw === 'Databricks')!;
    expect(db.state).toBe('missing');
    expect(db.wrongBefore).toEqual(['databrick']);
    expect(g.words.find((w) => w.raw === 'dashboard')!.state).toBe('correct');
  });

  it('accepts a compound typed as two words', () => {
    const g = grade('the Databricks dashboard', 'the data bricks dashboard');
    expect(g.passed).toBe(true);
    expect(g.words.every((w) => w.wrongBefore.length === 0)).toBe(true);
  });

  it('extra words cost points and block a pass', () => {
    const g = grade('get the access', 'get all the access');
    expect(g.passed).toBe(false);
    expect(g.score).toBeLessThan(1);
    expect(g.words[1].wrongBefore).toEqual(['all']);
  });

  it('puts unmatched trailing typing on the missing tail', () => {
    const g = grade('did you get the access', 'did you get the axis');
    expect(g.words[4].wrongBefore).toEqual(['axis']);
  });
});

describe('hint', () => {
  it('keeps the right start and adds the next word', () => {
    expect(hint('Cool, thanks for doing this, Cal.', 'cool thanks')).toBe('Cool thanks for ');
    expect(hint('Cool, thanks for doing this.', 'cool thx')).toBe('Cool thanks ');
    expect(hint('Uh, yes, I did.', '')).toBe('yes ');
  });
});

describe('segments', () => {
  it('reads WebVTT voice tags and Zoom speaker prefixes', () => {
    expect(cleanCueText('<v Sheree Liao>Hello.</v>')).toEqual({ text: 'Hello.', speaker: 'Sheree Liao' });
    expect(cleanCueText('Cao Nguyen: get the access?')).toEqual({ text: 'get the access?', speaker: 'Cao Nguyen' });
    expect(cleanCueText('Tom &amp; Jerry <c.yellow>run</c>').text).toBe('Tom & Jerry run');
  });

  it('merges fragments into sentences and splits on speaker change', () => {
    const segs = buildSegments([
      { start: 32.2, end: 37.2, text: '<v Sheree Liao>Hello.</v>' },
      { start: 40.4, end: 42.1, text: '<v Sheree Liao>Did you</v>' },
      { start: 42.1, end: 44, text: '<v Cao Nguyen>get the access?</v>' },
      { start: 44.2, end: 46, text: '<v Cao Nguyen>I shared it with</v>' },
      { start: 46, end: 47.5, text: '<v Cao Nguyen>the whole team yesterday.</v>' },
    ]);
    expect(segs.map((s) => s.text)).toEqual(['Hello.', 'Did you', 'get the access? I shared it with the whole team yesterday.']);
    expect(segs[2].start).toBe(42.1);
    expect(segs[2].end).toBe(47.5);
  });

  it('breaks unpunctuated auto captions on length', () => {
    const cues = Array.from({ length: 60 }, (_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.3, text: `w${i}` }));
    const segs = buildSegments(cues);
    expect(segs.length).toBeGreaterThan(2);
    segs.forEach((s) => expect(s.text.split(' ').length).toBeLessThanOrEqual(24));
  });

  it('parses clocks', () => {
    expect(parseClock('01:02:03.5')).toBe(3723.5);
    expect(parseClock('02:03,250')).toBeCloseTo(123.25);
    expect(parseClock('0:42')).toBe(42);
    expect(Number.isNaN(parseClock('nope'))).toBe(true);
  });

  it('parses .vtt, .srt and plain timestamped transcripts', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Ann>Hello there.\n\n2\n00:00:03.500 --> 00:00:05.000\nSecond line';
    expect(parseSubtitleFile(vtt)).toEqual([
      { start: 1, end: 3, text: 'Hello there.', speaker: 'Ann' },
      { start: 3.5, end: 5, text: 'Second line', speaker: undefined },
    ]);
    const srt = '1\r\n00:00:01,000 --> 00:00:02,500\r\nBob: Hi\r\n\r\n';
    expect(parseSubtitleFile(srt)).toEqual([{ start: 1, end: 2.5, text: 'Hi', speaker: 'Bob' }]);
    const plain = '00:32 Hello. Did you\n00:42 get the access?\nstill row two';
    expect(parseSubtitleFile(plain).map((c) => [c.start, c.end, c.text])).toEqual([
      [32, 42, 'Hello. Did you'],
      [42, expect.any(Number), 'get the access? still row two'],
    ]);
  });

  it('parses a transcript copied from YouTube (timestamp on its own line)', () => {
    const pasted = '0:12\nSo in college, I was a government major,\n0:15\nwhich means I had to write a lot of papers.\n';
    expect(parseSubtitleFile(pasted).map((c) => [c.start, c.text])).toEqual([
      [12, 'So in college, I was a government major,'],
      [15, 'which means I had to write a lot of papers.'],
    ]);
  });

  it('rows end where the next starts', () => {
    expect(rowsToCues([{ start: 1, text: 'a' }, { start: 4, text: 'b' }], 9).map((c) => c.end)).toEqual([4, 9]);
  });

  it('hasWords is false for filler-only segments', () => {
    expect(hasWords('Uhm. Uh.')).toBe(false);
    expect(hasWords('Uhm, okay.')).toBe(true);
  });
});

import { mergeResults } from './src/progress';

describe('mergeResults', () => {
  const r = (score: number, passed = false, revealed = false) => ({ typed: '', score, passed, revealed });
  it('keeps the better answer per segment', () => {
    const merged = mergeResults({ 0: r(0.5), 1: r(1, true), 2: r(0.3) }, { 0: r(1, true), 1: r(0.2), 3: r(0.1, false, true) });
    expect(merged[0].passed).toBe(true);
    expect(merged[1].passed).toBe(true);
    expect(merged[2].score).toBe(0.3);
    expect(merged[3].revealed).toBe(true);
  });
});
