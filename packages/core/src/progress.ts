/** One segment's outcome, the same shape on the website, the extension and the server. */
export interface Result {
  typed: string;
  score: number;
  passed: boolean;
  revealed: boolean;
}
export type Results = Record<string, Result>;

export const isDone = (r?: Result): boolean => !!r && (r.passed || r.revealed);

/** Two devices practised the same recording: keep the better answer for each segment. */
export function mergeResults(a: Results, b: Results): Results {
  const out: Results = { ...a };
  for (const [k, r] of Object.entries(b)) {
    const cur = out[k];
    if (!cur) out[k] = r;
    else if (r.passed && !cur.passed) out[k] = r;
    else if (r.passed === cur.passed && isDone(r) && !isDone(cur)) out[k] = r;
    else if (r.passed === cur.passed && isDone(r) === isDone(cur) && r.score > cur.score) out[k] = r;
  }
  return out;
}

/** Identifies a transcript well enough to tell when saved progress no longer lines up with it. */
export function transcriptFingerprint(segments: { text: string }[]): string {
  return `${segments.length}:${segments[0]?.text.slice(0, 40) ?? ''}`;
}
