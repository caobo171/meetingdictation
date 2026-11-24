# MeetingDictation

A Chrome extension that turns a recorded meeting into WELE-style dictation
practice: it blurs the transcript and captions, plays the recording one sentence
at a time, and grades what you type word by word.

## Install (unpacked)

Learners: download the zip from the website's **Extension** page
(`/app/extension`), unzip it, then **Load unpacked** the
`meetingdictation-extension` folder in `chrome://extensions` (Developer mode on).

Developers: from the repo root: `npm install`, then `npm run ext`. Open `chrome://extensions`,
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
| Teams meeting recordings: the meeting's **Recap** in Teams on the web, or the recording's Stream page (`*.sharepoint.com/…/stream.aspx`) | the recording's full transcript from Stream's own API, with speakers | a **Dictation** pill |
| Zoom, Meet, Drive, anything else | download the recording's `.vtt` / `.srt` and use **Load .vtt / .srt** in the panel | toolbar button |

In Teams on the web, open the meeting's chat, then **Recap**: the pill appears while a
recording is on screen. Recap plays the recording and shows its transcript in two
SharePoint frames the Teams page can't reach, so a small script (`src/frame.ts`) runs
inside those frames: it plays and seeks the video, blurs the transcript there, and reads
the whole transcript from the same API Stream's player uses, signed in as you. After
installing or reloading the extension, reload the Teams tab once so those frames get the
script. The recording's Stream page (in the chat, **Shared**, then its
`sharepoint.com/:v:/…` link) works too. On both you type into the transcript itself, as on
Loom: in Recap the blanks are made inside the transcript's frame and the panel drives them
by message. Teams' transcript list draws only the rows on screen, so a line's blanks appear
when its row is drawn, and moving to a line scrolls the list until it is.

On other sites the extension only gets access when you click its button
(`activeTab`). It has no standing permission there.

## Practising

### Type in the transcript (default: Loom, YouTube, Teams)

Where the site shows its own transcript next to the video, each line becomes a
row of blanks, one per spoken word, and you type straight into them as on
WELE's podcast page. Speaker names, punctuation and "uh" / "um" stay visible.
Nothing is marked while you type: <kbd>Enter</kbd> (or the line's **Submit** button) submits the line, the blanks give way to the
sentence as WELE's result page shows it (right words green, wrong words crossed out, missed words in red) with a done mark. Each line
is submitted once; Enter on a submitted line goes to the next one. A word given by a hint completes the line but does not
score. **Blanks 100% / 75% / 50% / 25%** in the panel leaves that share of the
words as blanks and shows the rest; which words is fixed per line, every line
keeps at least one blank, and nothing typed is lost when you change it. Turn it off with **Type in the transcript** in the panel to use the text
box below instead; the choice is remembered.

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> / <kbd>Tab</kbd> | next blank; Tab on the last one goes to the next line, Shift+Tab goes back (typing or pasting several words fills the next blanks) |
| <kbd>Backspace</kbd> on an empty blank | previous blank |
| <kbd>↑</kbd> / <kbd>↓</kbd> | previous / next line |
| <kbd>Enter</kbd> | check the line; on a finished line, go to the next one and play it |
| <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>, <kbd>Alt</kbd>+<kbd>H</kbd> / <kbd>A</kbd> / <kbd>L</kbd> | as in the text box below |

The video is never paused for you: it plays on past the line (only **Loop** stops and repeats a
line). While it plays, the line it is on gets an amber background; the line you are typing keeps its
own highlight, caret and **Submit** button.

The panel lists these keys. Change any of them with the ⚙ button in the panel's header: click a key, press
the new one (Esc cancels). A letter on its own, and the keys typing needs (Space, Enter, arrows), need
<kbd>Alt</kbd> or <kbd>Ctrl</kbd> added; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> plus a bare key such as <kbd>1</kbd> still types it. <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> and the <kbd>Alt</kbd> keys also work when
the focus is on the page (after clicking the video), so the site's player never takes them; they are
left alone only inside the site's own text fields.

On Loom the big video is a looping 5-second preview and the real recording stays
hidden until it is started, so the first <kbd>1</kbd> presses Loom's own play
button before seeking to the line.

### The answer blanks (untick Type in the transcript)

With **Type in the transcript** unticked, the site's transcript stays hidden (blurred) and you type in the panel: one blank per spoken
word of the current sentence. Nothing is marked while you type. <kbd>Enter</kbd> checks the whole
sentence: right words turn green, wrong ones red, and the sentence is shown with the words you
missed. A word shown by a hint or Show answer counts as a mistake.
Words you are never asked for ("uh", "hi", "then") are printed between the blanks.
<kbd>Space</kbd> / <kbd>Tab</kbd> move to the next blank, <kbd>Backspace</kbd> on an empty one goes
back. Drag the panel's bottom-right corner to resize it; the size is remembered.

### What stays visible

Speaker names and times are never blurred. Greetings and small talk ("Hi, Mark. Hi, Joe.",
"How are you?", "Can you see my screen?", "Thanks, Tess.") are shown whole and skipped when
moving from line to line, and don't count towards progress. Inside a line, fillers ("uh",
"hmm") and the words *hi*, *hello*, *hey*, *oh*, *wow*, *yeah*, *yep* and *then* are shown
instead of blanked. The same rules apply on Loom, YouTube and Teams (`isSmallTalk` and
`SHOWN_WORDS` in `@md/core`).

### Sentences and keys

Captions are merged into one sentence (or one breath) per segment, split when
the speaker changes or pauses. Segments that are only "uh" / "um" are skipped.

Keys in the answer blanks (the same keys as WELE):

| Key | Action |
| --- | --- |
| <kbd>1</kbd> | play / pause the segment |
| <kbd>2</kbd> / <kbd>3</kbd> | back / forward 2 seconds (change the step with the **±2s** menu: 1, 2, 3, 5 or 10 s) |
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
- `src/stream.ts` – a Teams recording's transcript from Stream's API
- `src/teams.ts` / `src/frame.ts` – Teams Recap: the Teams side, and the script in its SharePoint frames that drives the player and holds the blanks
- `src/onetranscript.ts` – Teams' transcript list (rows matched to the API by entry id; a virtual list)
- `src/blur.ts` – what gets blurred
- `src/wordbox.ts` – the panel's answer blanks, one per word
- `src/inline.ts` – blanks inside the site's own transcript lines (opt-in)
- `src/panel.ts` – the panel (shadow DOM; swallows key events so the site's player shortcuts don't fire)
- `src/ui.tsx` – the panel's selects, checkboxes and key settings (Radix primitives, menus portalled into the shadow DOM)
- `src/keys.ts` – the learner's shortcut keys
- `src/content.ts` / `src/background.ts` – entry points

`npm test` at the root runs the core tests. The build bundles each entry into one IIFE
with esbuild, because content scripts cannot be ES modules.
