# Social media scheduler

A subscription web app where users connect their Facebook Pages, Instagram accounts, YouTube
channels and Pinterest accounts, then schedule posts to each one on its own timetable, from the
app or from a Google Sheet.

**Start with [docs/SETUP-CHECKLIST.md](docs/SETUP-CHECKLIST.md).** It lists everything you must
prepare (developer apps, reviews, server, payments) before real users can post.

## What it does

- Sign up, sign in, password reset, account deletion.
- Monthly plans with limits (accounts, posts per month, sheets), free trial, admin panel.
  Billing is a pluggable layer; it ships with a manual gateway (user submits a transaction ID,
  admin approves).
- Connect accounts over OAuth; tokens are stored encrypted (AES-256-GCM). Each connection shows a
  live status (Connected / Reconnect needed / Error) and is re-verified automatically every day.
- One post, many accounts: every account gets its own date and time, and optionally its own text
  and options (Pinterest board, YouTube visibility).
- Weekly posting slots per account, with "next free slot" in the composer.
- Google Sheets scheduling: one row per post per account; edits and deletions sync; status is
  written back to the sheet.
- Calendar view, analytics (engagement, views, best times, top posts) and a media library.
- Recycling (repeat a post every N days), pause/resume per account, duplicate a post.
- Bulk CSV upload, RSS/Atom auto-posting, saved templates and hashtag groups.
- Optional AI writing assistant (set `ANTHROPIC_API_KEY`).
- UTM tagging, tracked short links, and a public link-in-bio page.
- Failure emails, signed webhooks, and a public API with API keys ([docs/API.md](docs/API.md)).
- A worker publishes due posts, retries temporary failures (3 attempts), and never double-posts.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma + PostgreSQL · BullMQ + Redis · Tailwind CSS ·
Docker Compose with Caddy for HTTPS.

```
src/app            pages and API routes
src/lib/providers  one file per network (meta.ts = Facebook + Instagram, youtube.ts, pinterest.ts)
src/lib/billing    plans, entitlements, payment gateway interface
src/lib/publish.ts claim -> publish -> retry logic
src/lib/sheets.ts  Google Sheets sync
worker/index.ts    background scheduler and publisher
prisma/            schema, migrations, plan seed
```

## Run locally

Needs Node 22, PostgreSQL and Redis.

```bash
cp .env.example .env        # set APP_URL=http://localhost:3000, DATABASE_URL, REDIS_URL,
                            # AUTH_SECRET, ENCRYPTION_KEY, UPLOAD_DIR=./uploads,
                            # ENABLE_MOCK_PROVIDER=true
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev                 # web on :3000
npm run worker:dev          # in a second terminal
```

With `ENABLE_MOCK_PROVIDER=true` a "Test network" appears on the Accounts page, so you can try
connect → schedule → publish without any platform credentials. A caption containing `[fail]`
simulates a permanent failure and `[retry]` a temporary one.

Real networks need a public HTTPS URL (they call back to it and download media from it), so test
those on the server or through a tunnel.

```bash
npm run typecheck
npm test
```

## Deploy

```bash
cp .env.example .env        # fill in everything in the Core section, plus platform keys
docker compose up -d --build
docker compose logs -f web worker
```

Caddy obtains the HTTPS certificate for `DOMAIN` automatically. Migrations and the plan seed run
each time the `web` container starts. To update: `git pull && docker compose up -d --build`.

Run exactly one `worker` container. Uploaded media lives in the `uploads` volume, shared by `web`
and `worker`; back it up together with the database.

## How publishing stays safe

- The database is the source of truth. Every 15 seconds the worker moves due targets from
  `SCHEDULED` to `QUEUED` with a conditional update, so a target is queued exactly once.
- A job claims its target (`QUEUED` → `PUBLISHING`) the same way; duplicate jobs do nothing.
- Temporary errors (rate limits, network, 5xx) go back to `SCHEDULED` with a 2 then 10 minute
  delay. Permanent errors become `FAILED` with the platform's message; the user can retry.
- An expired or revoked token marks the account "Reconnect needed" and fails the post with that
  explanation.
- If the worker crashes mid-publish, the target is failed after 45 minutes rather than re-posted,
  because the post may already be live.
- Publishing checks the subscription again at send time.

## Adding a payment gateway

Implement `PaymentGateway` in `src/lib/billing/gateway.ts` (`createCheckout` returns a redirect
URL; `handleWebhook` verifies the signature and returns `paid` / `canceled` events), register it,
set `BILLING_PROVIDER`, and point the gateway's webhook at
`{APP_URL}/api/billing/webhook/<id>`.

## Known limits

- Media is stored on local disk and served from `/media/<random key>`. Networks fetch media from
  those URLs, so they are public to anyone who has the link.
- Instagram accepts only JPEG images; other formats are converted when publishing.
- Google Drive links in sheets work for publicly shared files small enough for a direct download.
- The Meta, YouTube and Pinterest integrations were written against their published API
  documentation and exercised here only through the built-in test network. Run the real-network
  checks in the checklist before launch.
