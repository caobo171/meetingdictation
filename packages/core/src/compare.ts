/**
 * Grading a typed segment against the transcript, the way WELE does it:
 * word by word, ignoring case and punctuation, so the learner is judged on
 * what they heard rather than on how the captioner punctuated it.
 *
 * Meeting speech is full of "uh"/"um"; those are never required and never
 * penalised. Contractions, spelled-out numbers and okay/OK are accepted in
 * either form.
 */

export const FILLERS = new Set([
  'uh', 'uhh', 'um', 'umm', 'uhm', 'erm', 'er', 'ah', 'eh', 'hmm', 'hm', 'mm', 'mhm', 'mmhmm', 'uhhuh',
]);

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "it's": 'it is', "that's": 'that is', "there's": 'there is', "here's": 'here is', "what's": 'what is',
  "he's": 'he is', "she's": 'she is', "who's": 'who is', "let's": 'let us', "where's": 'where is', "how's": 'how is',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "it'll": 'it will',
  "he'll": 'he will', "she'll": 'she will', "that'll": 'that will',
  "i'd": 'i would', "you'd": 'you would', "we'd": 'we would', "they'd": 'they would',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not',
  "wasn't": 'was not', "weren't": 'were not', "can't": 'can not', "cannot": 'can not', "couldn't": 'could not',
  "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "haven't": 'have not',
  "hasn't": 'has not', "hadn't": 'had not', "mustn't": 'must not',
  alright: 'all right', okay: 'ok', 'o.k': 'ok', gonna: 'going to', wanna: 'want to', gotta: 'got to',
};

const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30',
  forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100',
  percent: '%',
};

export interface Token {
  raw: string;
  /** Comparable units; one raw word can expand to several ("it's" → it, is). Empty = filler. */
  units: string[];
}

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, '')
    .replace(/(\p{L})\.(?=\p{L})/gu, '$1'); // u.s → us
}

function unitsOf(word: string): string[] {
  const w = normalizeWord(word);
  if (!w || FILLERS.has(w.replace(/-/g, ''))) return [];
  const expanded = CONTRACTIONS[w] ?? w;
  return expanded
    .split(/\s+/)
    .flatMap((part) => {
      const m = part.match(/^(\d+(?:[.,]\d+)?)%$/); // "40%" → 40, %
      return m ? [m[1], '%'] : [part];
    })
    .map((u) => NUMBERS[u] ?? u.replace(/,(?=\d{3}\b)/g, ''))
    .filter(Boolean);
}

/** A sound tag is at most this many words: "(Laughter)", "[Music]", "(Audience cheers)". */
const SOUND_TAG_WORDS = 4;

/**
 * Which tokens sit inside a sound tag: what the captioner heard rather than
 * what was said, in brackets (TED's "(Laughter)", YouTube's "[Music]"). They
 * are shown, never asked for. A longer aside in brackets is speech.
 */
function soundTagged(tokens: string[]): boolean[] {
  const out = tokens.map(() => false);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^[^\p{L}\p{N}]*[([]/u.test(tokens[i])) continue;
    for (let j = i; j < Math.min(tokens.length, i + SOUND_TAG_WORDS); j += 1) {
      if (/[)\]][^\p{L}\p{N}]*$/u.test(tokens[j])) {
        out.fill(true, i, j + 1);
        i = j;
        break;
      }
    }
  }
  return out;
}

export function tokenize(text: string): Token[] {
  const raws = (text || '')
    .replace(/[’‘]/g, "'")
    .split(/[\s—–/]+|(?<=\p{L})-(?=\p{L})/u)
    .filter((w) => w.trim());
  const sound = soundTagged(raws);
  return raws.map((raw, i) => ({ raw, units: sound[i] ? [] : unitsOf(raw) }));
}

export type WordState = 'correct' | 'missing' | 'partial' | 'filler';

export interface GradedWord {
  raw: string;
  state: WordState;
  /** Wrong words the learner typed just before this one. */
  wrongBefore: string[];
}

export interface Grade {
  words: GradedWord[];
  /** Wrong words typed after the last reference word. */
  trailingWrong: string[];
  correctUnits: number;
  totalUnits: number;
  /** 0..1 */
  score: number;
  passed: boolean;
}

/** Longest common subsequence alignment of two unit arrays → for each a-index, the matched b-index or -1. */
function align(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const match = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      match[i] = j;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  return match;
}

export function grade(reference: string, typed: string): Grade {
  const ref = tokenize(reference);
  const inp = tokenize(typed);

  const refUnits: { unit: string; tok: number }[] = [];
  ref.forEach((t, ti) => t.units.forEach((unit) => refUnits.push({ unit, tok: ti })));
  const inUnits: { unit: string; tok: number }[] = [];
  const pairedWith = new Map<number, number>();
  inp.forEach((t, ti) => t.units.forEach((unit) => inUnits.push({ unit, tok: ti })));

  // "data bricks" for "Databricks", "log in" for "login": two typed words that
  // spell one reference word count as that word (meeting speech is full of product names).
  const refSet = new Set(refUnits.map((u) => u.unit));
  for (let i = 0; i + 1 < inUnits.length; i += 1) {
    const joined = inUnits[i].unit + inUnits[i + 1].unit;
    if (!refSet.has(inUnits[i].unit) && refSet.has(joined)) {
      inUnits.splice(i, 2, { unit: joined, tok: inUnits[i].tok });
      pairedWith.set(inUnits[i].tok, inp[inUnits[i].tok + 1] ? inUnits[i].tok + 1 : -1);
    }
  }

  const match = align(refUnits.map((u) => u.unit), inUnits.map((u) => u.unit));

  // Which typed tokens were (fully) used by the alignment.
  const usedInputTok = new Set<number>();
  match.forEach((j) => {
    if (j < 0) return;
    usedInputTok.add(inUnits[j].tok);
    const partner = pairedWith.get(inUnits[j].tok);
    if (partner !== undefined && partner >= 0) usedInputTok.add(partner);
  });

  // Per reference word: how many of its units matched, and the first typed word it matched.
  const perTok = ref.map(() => ({ hit: 0, total: 0, firstInput: -1 }));
  refUnits.forEach((u, i) => {
    const slot = perTok[u.tok];
    slot.total += 1;
    if (match[i] >= 0) {
      slot.hit += 1;
      if (slot.firstInput < 0) slot.firstInput = inUnits[match[i]].tok;
    }
  });

  const words: GradedWord[] = ref.map((t, i) => {
    const s = perTok[i];
    const state: WordState =
      t.units.length === 0 ? 'filler' : s.hit === s.total ? 'correct' : s.hit > 0 ? 'partial' : 'missing';
    return { raw: t.raw, state, wrongBefore: [] };
  });

  // Each wrong typed word sits next to the word it most likely replaced: the
  // first unheard word between the reference words it was typed between.
  const trailingWrong: string[] = [];
  inp.forEach((t, i) => {
    if (usedInputTok.has(i) || t.units.length === 0) return;
    const after = perTok.findIndex((s) => s.firstInput > i); // next ref word matched later in the typing
    let before = -1; // last ref word matched earlier in the typing
    perTok.forEach((s, k) => {
      if (s.firstInput >= 0 && s.firstInput < i) before = k;
    });
    const stop = after < 0 ? words.length : after;
    let target = -1;
    for (let k = before + 1; k < stop; k += 1) {
      if (words[k].state === 'missing' || words[k].state === 'partial') {
        target = k;
        break;
      }
    }
    if (target < 0) target = after;
    if (target < 0) trailingWrong.push(t.raw);
    else words[target].wrongBefore.push(t.raw);
  });

  const totalUnits = refUnits.length;
  const correctUnits = match.filter((j) => j >= 0).length;
  const extras = inUnits.length - correctUnits;
  const score = totalUnits === 0 ? 1 : Math.max(0, correctUnits - extras * 0.5) / totalUnits;
  return {
    words,
    trailingWrong,
    correctUnits,
    totalUnits,
    score,
    passed: correctUnits === totalUnits && extras === 0,
  };
}

/**
 * WELE's hint: keep what the learner got right from the start, and give them
 * the next word.
 */
export function hint(reference: string, typed: string): string {
  const ref = tokenize(reference).filter((t) => t.units.length > 0);
  const inUnits = tokenize(typed).flatMap((t) => t.units);
  let u = 0;
  let k = 0;
  for (; k < ref.length; k += 1) {
    const units = ref[k].units;
    if (units.every((unit, x) => inUnits[u + x] === unit)) u += units.length;
    else break;
  }
  const upTo = Math.min(k + 1, ref.length);
  return `${ref.slice(0, upTo).map((t) => t.raw.replace(/[^\p{L}\p{N}'%]+$/u, '')).join(' ')} `;
}

export function hasWords(text: string): boolean {
  return tokenize(text).some((t) => t.units.length > 0);
}

/**
 * Words shown rather than asked for in the blanks: interjections and the
 * linking "then". Grading never needs them either way.
 */
export const SHOWN_WORDS = new Set(['hi', 'hello', 'hey', 'hiya', 'oh', 'ooh', 'wow', 'yeah', 'yep', 'yup', 'then']);

/** Greetings and meeting small talk: "Hi, Mark.", "How are you?", "Can you see my screen?" */
const SMALL_TALK = new Set([
  ...SHOWN_WORDS,
  'howdy', 'good', 'morning', 'afternoon', 'evening', 'day', 'bye', 'goodbye', 'see', 'ya', 'later', 'soon',
  'thanks', 'thank', 'you', 'cheers', 'welcome', 'nice', 'to', 'meet', 'again', 'how', 'are', 'is', 'it', 'going',
  'doing', "how's", "it's", 'everyone', 'everybody', 'all', 'guys', 'folks', 'team', 'yes', 'no', 'nope', 'ok',
  'okay', 'alright', 'right', 'sure', 'cool', 'great', 'awesome', 'fine', 'good', 'too', 'and', 'i', "i'm", 'am',
  'so', 'well', 'sorry', 'can', 'hear', 'me', 'my', 'screen', 'there', 'just', 'a', 'sec', 'second', 'one',
  'moment', 'nice', 'much', 'very', 'very', 'the', 'thats', "that's", 'perfect', 'lovely', 'hello',
]);

/**
 * A line that is only a greeting or small talk, with names allowed alongside
 * a greeting ("Hi, Mark. Hi, Joe."). It is shown, not practised.
 */
export function isSmallTalk(text: string): boolean {
  const words = (text || '').replace(/[’‘]/g, "'").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean);
  const spoken = words.filter((w) => unitsOf(w).length > 0);
  if (!spoken.length) return true; // only "uh", "mm"…
  if (spoken.length > 10) return false;
  let greeted = false;
  let names = 0;
  for (const [k, w] of spoken.entries()) {
    const lower = w.toLowerCase();
    if (SMALL_TALK.has(lower)) {
      greeted ||= SHOWN_WORDS.has(lower) || /^(morning|afternoon|evening|thanks|thank|bye|goodbye|cheers|welcome)$/.test(lower);
      continue;
    }
    if (k > 0 && /^\p{Lu}\p{Ll}+$/u.test(w)) {
      names += 1; // a name: "Hi, Mark"
      continue;
    }
    return false;
  }
  return names === 0 || greeted;
}

/** One slot of a transcript line in "type in the blanks" mode. */
export interface BlankPart {
  /** Punctuation shown as-is before the word. */
  pre: string;
  /** The word to type; empty when the token is only punctuation. */
  word: string;
  post: string;
  /** "uh", "um", "hi", "then"…: shown, never asked for. */
  filler: boolean;
}

/** Split a transcript line into blanks, one per spoken word, with its punctuation kept visible. */
export function blankParts(text: string): BlankPart[] {
  const toks = (text || '')
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .filter(Boolean);
  const sound = soundTagged(toks);
  return toks.map((tok, i) => {
    const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}%]*)$/u)!;
    const word = m[2];
    return {
      pre: m[1],
      word,
      post: m[3],
      filler: !!word && (sound[i] || unitsOf(word).length === 0 || SHOWN_WORDS.has(normalizeWord(word))),
    };
  });
}

/** Does one typed word count as this transcript word? Same rules as grade(). */
export function wordMatches(reference: string, typed: string): boolean {
  const a = unitsOf(reference).join(' ');
  const b = unitsOf(typed.trim()).join(' ');
  if (!b) return false;
  const bare = (w: string) => normalizeWord(w).replace(/'/g, '');
  return a === b || bare(reference) === bare(typed); // "lets" for "let's"
}
