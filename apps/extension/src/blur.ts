/**
 * Hiding the answer: blur every transcript and caption the site draws, and
 * stop the browser drawing caption tracks. A row the learner has finished is
 * marked `md-done` and shows again.
 */

const STYLE_ID = 'meetingdictation-blur';

const BLUR_TARGETS = [
  // Loom
  '[data-testid^="transcript-row-"] [dir="ltr"]',
  // YouTube
  'ytd-transcript-segment-renderer .segment-text',
  'transcript-segment-view-model > [role="text"]',
  'transcript-segment-view-model > .ytAttributedStringHost',
  '.ytp-caption-window-container',
  // Microsoft Stream (Teams recordings on SharePoint / OneDrive)
  '#OneTranscript [data-transcript-copy-field="text"]',
  // Anything that calls itself a transcript or captions (Zoom, Teams/Stream, Drive, Vimeo, LMS players)
  ':is([class*="transcript" i], [id*="transcript" i], [data-testid*="transcript" i], [aria-label*="transcript" i]) :is(p, span, div, li):not(:has(*)):not(:is(button, [role="tab"], [data-testid^="sidebar-tab"], [data-testid^="transcript-row-"], ytd-transcript-segment-renderer, transcript-segment-view-model) *)',
  ':is([class*="caption" i], [class*="subtitle" i], [class*="closed-caption" i]):not(:has(video)):not(video):not(button):not(figcaption)',
  '.vjs-text-track-display',
  '.plyr__captions',
];

const CSS = `
html[data-md-blur] :is(${BLUR_TARGETS.join(',\n  ')}):not(.md-done) {
  filter: blur(7px) !important;
  user-select: none !important;
  transition: filter .25s ease;
}
html[data-md-blur] :is(${BLUR_TARGETS.join(',\n  ')}).md-done {
  filter: none !important;
  background: rgba(34, 197, 94, .12);
  border-radius: 4px;
}
`;

let hiddenTracks: TextTrack[] = [];
let trackGuard: ((this: TextTrackList) => void) | null = null;

export function setBlur(on: boolean, video: HTMLVideoElement | null): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  document.documentElement.toggleAttribute('data-md-blur', on);

  if (!video) return;
  if (on) {
    const hide = () => {
      for (const t of video.textTracks) {
        if (t.mode === 'showing') {
          t.mode = 'hidden'; // cues stay readable to us, nothing is drawn
          if (!hiddenTracks.includes(t)) hiddenTracks.push(t);
        }
      }
    };
    hide();
    if (!trackGuard) {
      trackGuard = hide;
      video.textTracks.addEventListener('change', trackGuard); // the player's CC button turns them back on
    }
  } else {
    if (trackGuard) video.textTracks.removeEventListener('change', trackGuard);
    trackGuard = null;
    for (const t of hiddenTracks) t.mode = 'showing';
    hiddenTracks = [];
  }
}
