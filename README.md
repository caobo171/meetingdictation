# MeetingDictation

Listening practice on real meetings. Blur the transcript of a recorded meeting,
play it one sentence at a time, type what you hear, and see exactly which words
you missed. Same idea, keys and grading as WELE's podcast dictation.

```
meetingdictation/
├── packages/core/   grading, hints, transcript parsing, progress merge (pure TS, tested)
├── apps/web/        Next.js 14 site: landing, sign-in, dashboard, practice, sync API
└── apps/extension/  Chrome extension: dictation right on Loom, YouTube, TED talks, any captioned video
```

## Run it locally

```bash
npm install
createdb meetingdictation                 # a local PostgreSQL database
cp apps/web/.env.example apps/web/.env    # then set AUTH_SECRET (openssl rand -base64 32)
npm run db:push -w @md/web                # creates the tables
npm run dev                               # http://localhost:4100
npm run ext                               # builds apps/extension/dist
npm run ext:pack                          # the zip behind the site's Download button
npm test                                  # core tests
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** →
`apps/extension`. Then on the site, **Extension → Connect extension**.

## Accounts

- **Email + password** (bcrypt) and **Google** through Auth.js. Google appears
  once `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set; the redirect URI is
  `<AUTH_URL>/api/auth/callback/google`. A Google sign-in joins the email
  account with the same address.
- **Email code**: a 6-digit code mailed through Amazon SES. It expires in 10
  minutes, allows 5 tries, and only the newest code works; at most 5 codes per
  address and 20 per IP an hour. A first sign-in by code creates the account.
  Without SES keys (development) the code is printed to the server console.
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

## Blog

Modelled on WELE's blog: `/blog` sends readers to their language (`/blog/vi`, `/blog/en`), which has a featured
post, the latest posts, topics and most read. Topic pages are at `/blog/<locale>/category/<slug>`. A post page has a
breadcrumb, key takeaways, a table of contents, "summarise with ChatGPT / Claude" links, tags, the next post, related
posts and a sign-up box. There are also generated covers and share images, JSON-LD, `/blog/<locale>/rss.xml`,
`/sitemap.xml` and `/robots.txt`.

- **Content**: `apps/web/content/blog/<locale>/<slug>.md`, with frontmatter (title, category, publishedAt, excerpt,
  meta fields, tags, takeaways) and a Markdown body. Topics are in `content/blog/categories.json`.
- **Seed**: `npm run db:seed-blog -w @md/web` creates missing posts and updates the ones that came from the files.
  It leaves alone any post that was created or edited in the admin, unless you pass `-- --force`. Add `-- --dry` to
  only validate the files.
- **Admin**: `/admin/blog`. You can create, edit, schedule (a future publish date) and delete posts there, and
  edit topics at `/admin/blog/categories`.

## Admin

`/admin`, laid out like WELE's admin: a sidebar grouped into People, Billing, Content, Communication and System.
Every change made there is written to the audit log.

- **Access**: `User.role` is `user`, `admin` or `super_admin`. The addresses in `ADMIN_EMAILS` (comma separated)
  are always super admins, which is how the first one gets in. An admin runs content and support: the dashboard,
  users (read only), blog, blog topics, recordings and announcements. A super admin also has customers, orders,
  subscriptions, coupons, the audit log and webhooks, can grant or remove Pro, can change roles and can delete
  accounts. Everyone else gets a 404.
- **Dashboard**: users, active learners, Pro count and revenue, with 30-day charts and the latest sign-ups, orders and
  admin actions.
- **Users**: search and filter by plan or role. The user page shows practice stats, recordings, recent practice,
  extension browsers, orders and admin history. From there you can add a year of Pro, grant lifetime, set a Pro end
  date, remove Pro, change the role, disconnect browsers and delete the account.
- **Orders**: Polar orders are recorded by the webhook (`order.paid` / `order.refunded` / `order.updated`), and
  **Import from Polar** backfills older ones. Manual orders (bank transfer, gifts) can use a coupon. They start
  pending or paid, and **Mark paid** grants the plan. Refunds are recorded on the order; they don't move money.
- **Pro granted by hand** is kept in `manualProUntil`. The Polar subscription webhook never sets `proUntil` earlier
  than that, so a renewal or trial update can't wipe out a manual grant.
- **Customers**: everyone who has paid, with the amount spent and first and last payment. **Subscriptions**: who
  has Pro and why (active, trial, cancelling, past due, ending soon, lifetime, given by hand, ended).
- **Coupons**: percent or fixed discounts for manual orders. They can be limited to a plan, a number of uses and an
  expiry date. Codes typed at Polar's checkout are Polar discounts, set up in Polar.
- **Announcements**: a banner across the app, and across the public site if marked public, with a start and end
  date. Learners can dismiss it.

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
- **Email**: WELE's SES account (`ap-southeast-1`) and keys. Mail leaves from
  `meetingdictation@wele-learn.com`, signed as the verified `wele-learn.com`
  domain (DKIM, MAIL FROM `plunk.wele-learn.com`).
- **Uploads** go to `UPLOAD_DIR` on local disk. Use a persistent volume, or
  move them to S3 before running more than one instance.
- **Extension download**: `script.sh` runs `npm run ext:pack` on every deploy.
  It builds the extension for `https://meetingdictation.com` and zips it to
  `apps/web/public/downloads/meetingdictation-extension.zip` (gitignored), which
  the **Download** button on `/app/extension` serves. Bump `version` in
  `apps/extension/manifest.json` when the extension changes.
- **Domain**: the extension trusts `http://localhost:4100` and
  `https://meetingdictation.com`, set in `apps/extension/src/config.ts` and
  `apps/extension/manifest.json` (host permissions and the connect script).

## Brand

The logo (`apps/web/public/logo.svg`, `components/Logo.tsx`) is a speech bubble
holding sound bars and a typing caret, with a gold "got it" dot. The palette is
WELE's warm paper and deep ink with MeetingDictation's own indigo
(`apps/web/app/globals.css`).
