# MeetingDictation

A Chrome extension that turns a recorded meeting into WELE-style dictation
practice: it blurs the transcript and captions, plays the recording one sentence
at a time, and grades what you type word by word.

## Install (unpacked)

From the repo root: `npm install`, then `npm run ext`. Open `chrome://extensions`,
turn on **Developer mode**, **Load unpacked**, and pick `apps/extension`. After a
code change, `npm run ext` and press reload on the extension card.

Sign in to sync: the panel's footer links to the website's
`/extension/connect`, which hands the extension a token (see the root README).

## Where it works

| Site | How it gets the transcript | How it starts |
| --- | --- | --- |
| Loom (`/share`, `/embed`) | the video's captions track; Loom's transcript list as fallback | a **Dictation** pill bottom-right |
| YouTube watch pages | the caption track if YouTube serves it, else it opens YouTube's own transcript panel | a **Dictation** pill |
| Any other page with a `<video>` that has a captions/subtitles track | the track | toolbar button or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> |
| Teams meeting recordings in Microsoft Stream (`*.sharepoint.com/…/stream.aspx`) | the recording's full transcript from Stream's own API, with speakers | a **Dictation** pill |
| Zoom, Meet, Drive, anything else | download the recording's `.vtt` / `.srt` and use **Load .vtt / .srt** in the panel | toolbar button |

Teams' own Recap view puts the player and the transcript in two separate frames,
so dictation runs on the recording's Stream page instead: in the meeting chat open
**Shared**, then the recording's `sharepoint.com/:v:/…` link. Stream shows only the
transcript entries in view, so the panel reads the whole transcript from the same
API Stream's player uses, signed in as you; typing into the transcript itself is
Loom and YouTube only, and on Stream you type in the panel.

On other sites the extension only gets access when you click its button
(`activeTab`). It has no standing permission there.

## Practising

### Type in the transcript (Loom, YouTube)

Where the site shows its own transcript next to the video, each line becomes a
row of blanks, one per spoken word, and you type straight into them as on
WELE's podcast page. Speaker names, punctuation and "uh" / "um" stay visible.
A word turns green as soon as it is right; <kbd>Enter</kbd> checks the line and
marks the wrong ones red. A word given by a hint completes the line but does not
score. **Blanks 100% / 75% / 50% / 25%** in the panel leaves that share of the
words as blanks and shows the rest; which words is fixed per line, every line
keeps at least one blank, and nothing typed is lost when you change it. Turn it off with **Type in the transcript** in the panel to use the text
box below instead; the choice is remembered.

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> / <kbd>Tab</kbd> | next blank (typing or pasting several words fills the next blanks) |
| <kbd>Backspace</kbd> on an empty blank | previous blank |
| <kbd>↑</kbd> / <kbd>↓</kbd> | previous / next line |
| <kbd>Enter</kbd> | check the line; on a finished line, go to the next one and play it |
| <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>, <kbd>Alt</kbd>+<kbd>H</kbd> / <kbd>A</kbd> / <kbd>L</kbd> | as in the text box below |

The panel lists these keys. Change any of them with the ⚙ button in the panel's header: click a key, press
the new one (Esc cancels). A letter on its own, and the keys typing needs (Space, Enter, arrows), need
<kbd>Alt</kbd> or <kbd>Ctrl</kbd> added; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> plus a bare key such as <kbd>1</kbd> still types it. <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> and the <kbd>Alt</kbd> keys also work when
the focus is on the page (after clicking the video), so the site's player never takes them; they are
left alone only inside the site's own text fields.

On Loom the big video is a looping 5-second preview and the real recording stays
hidden until it is started, so the first <kbd>1</kbd> presses Loom's own play
button before seeking to the line.

### The text box

Captions are merged into one sentence (or one breath) per segment, split when
the speaker changes or pauses. Segments that are only "uh" / "um" are skipped.

Keys inside the text box (the same keys as WELE):

| Key | Action |
| --- | --- |
| <kbd>1</kbd> | play / pause the segment |
| <kbd>2</kbd> / <kbd>3</kbd> | back / forward 2 seconds |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>1</kbd>–<kbd>3</kbd> | type the digit itself |
| <kbd>Enter</kbd> | check; <kbd>Enter</kbd> again goes to the next segment and plays it |
| <kbd>Alt</kbd>+<kbd>H</kbd> | hint: keeps your correct start and adds the next word |
| <kbd>Alt</kbd>+<kbd>A</kbd> | show the answer |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | previous / next segment |
| <kbd>Alt</kbd>+<kbd>L</kbd> | loop the segment |

**⌖ Here** jumps to the segment at the video's current time. Speed defaults to
1× whatever the site's player was set to.

Grading ignores case and punctuation, never requires fillers, and accepts
contractions (`it's` = `it is`), numbers (`two` = `2`, `40%` = `40 percent`),
`okay` = `ok`, and a compound typed as two words (`data bricks` = `Databricks`).
Wrong words are crossed out next to the word they replaced; words not heard yet
show as `*****`.

Progress is saved per page in `chrome.storage.local`. Rows of the site's own
transcript (Loom, YouTube) un-blur once every segment in them is finished.

## Code

- `@md/core` (`packages/core`) – grading, hints, transcript parsing, progress merge
- `src/sync.ts`, `src/background.ts`, `src/connect.content.ts` – account sync
- `src/sources.ts` – per-site transcript adapters
- `src/blur.ts` – what gets blurred
- `src/inline.ts` – blanks inside the site's own transcript lines
- `src/panel.ts` – the panel (shadow DOM; swallows key events so the site's player shortcuts don't fire)
- `src/ui.tsx` – the panel's selects, checkboxes and key settings (Radix primitives, menus portalled into the shadow DOM)
- `src/keys.ts` – the learner's shortcut keys
- `src/content.ts` / `src/background.ts` – entry points

`npm test` at the root runs the core tests. The build bundles each entry into one IIFE
with esbuild, because content scripts cannot be ES modules.
