# MeetingDictation

Listening practice on real meetings. Blur the transcript of a recorded meeting,
play it one sentence at a time, type what you hear, and see exactly which words
you missed. Same idea, keys and grading as WELE's podcast dictation.

```
meetingdictation/
├── packages/core/   grading, hints, transcript parsing, progress merge (pure TS, tested)
├── apps/web/        Next.js 14 site: landing, sign-in, dashboard, practice, sync API
└── apps/extension/  Chrome extension: dictation right on Loom, YouTube, any captioned video
```

## Run it locally

```bash
npm install
createdb meetingdictation                 # a local PostgreSQL database
cp apps/web/.env.example apps/web/.env    # then set AUTH_SECRET (openssl rand -base64 32)
npm run db:push -w @md/web                # creates the tables
npm run dev                               # http://localhost:4100
npm run ext                               # builds apps/extension/dist
npm test                                  # core tests
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** →
`apps/extension`. Then on the site, **Extension → Connect extension**.

## Accounts

- **Email + password** (bcrypt) and **Google** through Auth.js. Google appears
  once `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set; the redirect URI is
  `<AUTH_URL>/api/auth/callback/google`. A Google sign-in joins the email
  account with the same address.
- **The extension** never sees a password. `/extension/connect` pings the
  extension's content script, mints a random `mdx_…` token only after it
  answers, and hands it over with `postMessage` to the same origin. The server
  stores only its SHA-256. Settings → *Connected browsers* revokes it.

## Website

- **Dashboard**: streak (in the learner's own time zone), sentences finished,
  minutes listened, accuracy, the last 14 days, and every recording practised
  on the site or in the extension.
- **New recording**: upload a video/audio file (served back with HTTP Range so
  the player can seek; owner only), or a YouTube link. The transcript is a
  `.vtt` / `.srt` file, or text pasted from YouTube's or Loom's transcript panel.
- **Practice**: player, a sentence list that un-blurs as you finish sentences,
  and the dictation card. Keys: <kbd>1</kbd> play, <kbd>2</kbd>/<kbd>3</kbd> ±2 s,
  <kbd>Enter</kbd> check / next, <kbd>Alt</kbd>+<kbd>H</kbd> hint,
  <kbd>Alt</kbd>+<kbd>A</kbd> answer, <kbd>Alt</kbd>+<kbd>←/→</kbd> move.
  Progress saves every few seconds and on tab close.

## Sync

One `Progress` row per learner and recording key (`web:<id>` on the site, the
page key in the extension). Both sides send their results; the server merges
them per sentence, keeping the better answer, so two devices never overwrite
each other. Sentences newly finished and seconds played go to `ActivityDay`,
which drives the streak and chart.

## Production

- **Database**: PostgreSQL. Production uses the database `meetingdictation`
  (its own role) in the shared `landing-postgres-1` container on wele_eu,
  `127.0.0.1:5433`. `script.sh` runs `prisma db push` on every deploy.
- **Uploads** go to `UPLOAD_DIR` on local disk. Use a persistent volume, or
  move them to S3 before running more than one instance.
- **Domain**: the extension trusts `http://localhost:4100` and
  `https://meetingdictation.app`, set in `apps/extension/src/config.ts` and
  `apps/extension/manifest.json` (host permissions and the connect script).
  Change both to the real domain and build with `MD_APP_URL=https://… npm run ext`.

## Brand

The logo (`apps/web/public/logo.svg`, `components/Logo.tsx`) is a speech bubble
holding sound bars and a typing caret, with a gold "got it" dot. The palette is
WELE's warm paper and deep ink with MeetingDictation's own indigo
(`apps/web/app/globals.css`).
