/**
 * TED talks (www.ted.com/talks/<slug>).
 *
 * The talk page is a Next.js page whose data (`__NEXT_DATA__`) holds the whole
 * transcript: paragraphs of cues, each with its start time in milliseconds,
 * in the page's language. `?language=<code>` gives it in another language, so
 * the transcript is always read in the language the speaker talks in.
 *
 * The page draws the same cues in its transcript (the sidebar, or the "Read
 * transcript" sheet on a narrow window): one `[data-cue-index]` element per
 * cue, numbered across the whole talk, so a cue element's time is the time of
 * the cue with that index. The captions over the video are TED's own
 * (`#subtitles-container`), and a pre-roll ad plays in `#ad-container`.
 */

import { hasWords } from '@md/core';

export interface TedTalk {
  slug: string;
  title: string;
  speaker: string;
  /** The language the speaker talks in, which the cues are in. */
  language: string;
  /** Every cue of the talk, in order; `start` in seconds. */
  cues: { start: number; text: string }[];
}

interface Paragraph {
  cues?: { text?: string; time?: number }[];
}

interface TalkProps {
  videoData?: {
    slug?: string;
    title?: string;
    presenterDisplayName?: string;
    audioInternalLanguageCode?: string;
    internalLanguageCode?: string;
  };
  transcriptData?: {
    translation?: { language?: { internalLanguageCode?: string }; paragraphs?: Paragraph[] } | null;
  };
}

export const TED_CUE = '[data-cue-index]';

export function isTed(): boolean {
  return /(^|\.)ted\.com$/.test(location.hostname);
}

/** The talk's slug on a talk page (also its /transcript page), else null. */
export function tedSlug(): string | null {
  if (!isTed()) return null;
  return location.pathname.match(/^\/talks\/([^/?#]+)/)?.[1] ?? null;
}

/** An ad is playing in TED's player: the talk's own <video> waits behind it. */
export function tedAdShowing(): boolean {
  const ad = document.getElementById('ad-container');
  return !!ad && !ad.classList.contains('hidden');
}

function propsOf(json: string | null | undefined): TalkProps | null {
  if (!json) return null;
  try {
    return (JSON.parse(json) as { props?: { pageProps?: TalkProps } }).props?.pageProps ?? null;
  } catch {
    return null;
  }
}

async function fetchProps(slug: string, language?: string): Promise<TalkProps | null> {
  const query = language ? `?language=${encodeURIComponent(language)}` : '';
  const html = await fetch(`/talks/${encodeURIComponent(slug)}${query}`, { credentials: 'include' }).then((r) => (r.ok ? r.text() : ''));
  return propsOf(html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1]);
}

let loaded: TedTalk | null = null;
let loading: Promise<TedTalk | null> | null = null;

/** The talk as already read for this page, if it has been (see `loadTedTalk`). */
export function tedTalk(): TedTalk | null {
  const slug = tedSlug();
  return loaded && loaded.slug === slug ? loaded : null;
}

/**
 * Read the talk this page shows. The page's own data first; TED moves between
 * talks without a page load and that data stays the first talk's, so another
 * talk, or a transcript in another language, is fetched like the page itself.
 */
export async function loadTedTalk(): Promise<TedTalk | null> {
  const slug = tedSlug();
  if (!slug) return null;
  if (loaded?.slug === slug) return loaded;
  if (loading) return loading;
  loading = (async () => {
    let props = propsOf(document.getElementById('__NEXT_DATA__')?.textContent);
    if (props?.videoData?.slug !== slug) props = await fetchProps(slug);
    if (!props?.videoData) return null;
    const video = props.videoData;
    const language = video.audioInternalLanguageCode || video.internalLanguageCode || 'en';
    if (props.transcriptData?.translation?.language?.internalLanguageCode !== language) {
      props = (await fetchProps(slug, language)) ?? props;
    }
    const paragraphs = props.transcriptData?.translation?.paragraphs ?? [];
    const cues = paragraphs
      .flatMap((p) => p.cues ?? [])
      .map((c) => ({ start: (c.time ?? Number.NaN) / 1000, text: (c.text ?? '').replace(/\s+/g, ' ').trim() }));
    if (!cues.length) return null;
    const talk: TedTalk = {
      slug,
      title: props.videoData?.title || video.title || slug,
      speaker: video.presenterDisplayName || '',
      language,
      cues,
    };
    if (tedSlug() === slug) loaded = talk;
    return talk;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export function tedCueEls(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TED_CUE)];
}

/**
 * "(Laughter)", "(Applause)": nothing to write, so never blurred. A data
 * attribute, because TED rewrites a cue's class as the talk plays.
 */
export function markTedSoundTags(): void {
  for (const el of tedCueEls()) el.toggleAttribute('data-md-shown', !hasWords(el.textContent ?? ''));
}

/** The transcript's "Read transcript" button (the sidebar shows it without one on a wide window). */
export function openTedTranscriptButton(): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('button')].find(
      (b) => /^\s*read transcript\s*$/i.test(b.textContent ?? '') && b.getBoundingClientRect().width > 0,
    ) ?? null
  );
}

const LAYOUT_ID = 'meetingdictation-ted';
/** The right column's scrolling box: the ad and "Watch next" above, the transcript section below. */
const COLUMN = 'aside:has(' + TED_CUE + ') > div:has(> section)';
const LAYOUT_CSS = `
html[data-md-ted] ${COLUMN} > :not(section) { display: none !important; }
html[data-md-ted] ${COLUMN} { padding-top: 0 !important; }
`;

/**
 * While dictation is open, the right column is the transcript alone, right
 * beside the video as on Loom: the ad block above it goes. TED's own layout
 * comes back when the panel closes.
 */
export function tedLayout(on: boolean): void {
  if (!isTed()) return;
  if (on && !document.getElementById(LAYOUT_ID)) {
    const style = document.createElement('style');
    style.id = LAYOUT_ID;
    style.textContent = LAYOUT_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  document.documentElement.toggleAttribute('data-md-ted', on);
}
