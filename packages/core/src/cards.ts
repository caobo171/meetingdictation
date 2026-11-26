/**
 * Flashcards from dictation mistakes, the way WELE keeps them: the words a
 * learner did not hear become blanks in the sentence they were heard in.
 */
import { tokenize, type Grade } from './compare';

const bare = (w: string) => w.replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, '');

/** The words of a graded sentence the learner missed (fully or partly), in order, without punctuation. */
export function missedWords(g: Grade): string[] {
  return g.words.filter((w) => w.state === 'missing' || w.state === 'partial').map((w) => bare(w.raw)).filter(Boolean);
}

/** Missed words from two attempts, each word once (case-insensitive), first spelling kept. */
export function mergeMissed(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...a, ...b]) {
    const k = w.toLowerCase();
    if (!w || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

export interface ClozePart {
  /** Text shown as-is (words and the spaces and punctuation around them). */
  text: string;
  /** A missed word to type: `text` is the answer. */
  blank: boolean;
}

/**
 * The sentence split into shown text and blanks, one blank per occurrence of a
 * missed word. Punctuation stays outside the blank.
 */
export function clozeParts(sentence: string, missed: string[]): ClozePart[] {
  const want = new Set(missed.map((w) => w.toLowerCase()));
  const parts: ClozePart[] = [];
  const push = (text: string, blank: boolean) => {
    const last = parts[parts.length - 1];
    if (!blank && last && !last.blank) last.text += text;
    else if (text) parts.push({ text, blank });
  };
  for (const piece of (sentence || '').split(/(\s+)/)) {
    const m = piece.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}%]*)$/u);
    const word = m?.[2] ?? '';
    if (m && word && want.has(word.toLowerCase())) {
      push(m[1], false);
      push(word, true);
      push(m[3], false);
    } else push(piece, false);
  }
  return parts;
}

/** The answer a cloze card asks for: its blanks in order, as one line. */
export function clozeAnswer(sentence: string, missed: string[]): string {
  return clozeParts(sentence, missed)
    .filter((p) => p.blank)
    .map((p) => p.text)
    .join(' ');
}

/** Does a sentence have anything worth a card (some spoken word)? */
export function cardWorthy(sentence: string): boolean {
  return tokenize(sentence).some((t) => t.units.length > 0);
}
