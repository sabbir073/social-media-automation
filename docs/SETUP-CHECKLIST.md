# Launch checklist: what you have to prepare

The code is finished, but every social network makes you register your own developer app and
pass a review before strangers' posts can go public through it. Nobody can do that part for you,
and it is the long pole: start the reviews in section 3 first, because they take days to weeks.

Replace `https://app.example.com` below with your real domain everywhere.

Platform rules change often. Everything here was checked against the platforms' documentation in
November 2026; re-check the linked pages when you do each step.

---

## 1. Business basics (needed by every review)

- [ ] A product name and logo (square, 1024×1024 PNG). Set `NEXT_PUBLIC_APP_NAME` to the name.
- [ ] A domain, with the app on HTTPS (for example `app.yourbrand.com`).
- [ ] A support email on that domain.
- [ ] Business registration documents (trade licence, TIN/BIN certificate, utility bill or bank
      statement showing the business name and address). Meta's Business Verification asks for these.
- [ ] Fill in the bracketed placeholders in the three legal pages and have them reviewed:
      `src/app/(legal)/privacy/page.tsx`, `terms/page.tsx`, `data-deletion/page.tsx`.
      Reviewers open these pages. Their public URLs are:
      - `https://app.example.com/privacy`
      - `https://app.example.com/terms`
      - `https://app.example.com/data-deletion`

## 2. Server

- [ ] A VPS with Docker (2 vCPU / 4 GB RAM / 80 GB disk is a sensible start; video uploads use disk).
- [ ] DNS `A` record for your domain pointing at the server. Open ports 80 and 443.
- [ ] `cp .env.example .env` and fill in: `APP_URL`, `DOMAIN`, `POSTGRES_PASSWORD` (and the same
      password inside `DATABASE_URL`), `AUTH_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`.
      Generate secrets with `openssl rand -base64 32`.
      **Never change `ENCRYPTION_KEY` after launch**: stored account tokens cannot be read without it.
- [ ] `docker compose up -d --build`, then open the site and register with `ADMIN_EMAIL`.
      That account becomes the admin.
- [ ] An SMTP account for password-reset emails (`SMTP_URL`, `MAIL_FROM`).
- [ ] Backups: a nightly `pg_dump` of the database and a copy of the `uploads` volume.

## 3. Platform developer apps

Each app needs the redirect URLs registered exactly as written here.

### 3a. Meta: Facebook Pages + Instagram (one app covers both)

1. [ ] Create a developer account at developers.facebook.com and a Business portfolio at
       business.facebook.com.
2. [ ] Complete **Business Verification** for the portfolio (uses the documents from section 1).
3. [ ] Create an app (type: Business). Add the product **Facebook Login for Business**.
4. [ ] In Facebook Login settings, add both Valid OAuth Redirect URIs:
       - `https://app.example.com/api/oauth/facebook/callback`
       - `https://app.example.com/api/oauth/instagram/callback`
5. [ ] In App settings → Basic: app icon, app domain, privacy policy URL, terms URL, and the
       data-deletion URL as "Data deletion instructions URL".
6. [ ] Put the App ID and App Secret in `.env` as `META_APP_ID` and `META_APP_SECRET`.
       Set `META_GRAPH_VERSION` to the current Graph API version shown in the app dashboard.
7. [ ] Test in Development mode. Until review passes, only people you add under App roles
       (admins, developers, testers) can connect accounts, which is enough to test end to end.
8. [ ] Submit **App Review** for Advanced Access to these permissions:
       `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
       `instagram_basic`, `instagram_content_publish`, `business_management`.
       For each one you write why the app needs it and upload a screen recording that shows:
       logging in to your app → clicking Connect → the Facebook permission dialog → the
       Page/Instagram account appearing as Connected → creating a post in your app → that post
       live on the Page / Instagram profile. Give the reviewer a test login for your app.
9. [ ] After approval, switch the app to **Live**.

What your users need: to be an admin of the Facebook Page; for Instagram, a Business or Creator
account linked to a Facebook Page they manage. Personal profiles and Groups cannot be posted to.

### 3b. Google: YouTube (and Google Sheets access)

1. [ ] Create a project at console.cloud.google.com. Enable **YouTube Data API v3** and
       **Google Sheets API**.
2. [ ] OAuth consent screen: User type External; app name, logo, support email; authorised domain;
       privacy policy and terms links. Add the scopes `youtube.upload` and `youtube.readonly`.
3. [ ] Verify ownership of your domain in Google Search Console (same Google account).
4. [ ] Credentials → Create OAuth client ID → Web application. Authorised redirect URI:
       `https://app.example.com/api/oauth/youtube/callback`.
       Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. [ ] While the consent screen is in "Testing", add yourself as a test user and test uploads.
       In Testing, Google expires connections after about a week and caps you at 100 test users,
       so this is for testing only.
6. [ ] Publish the consent screen and submit **OAuth verification** (the YouTube scopes are
       sensitive). Google asks for a demo video of the consent flow and of how the data is used.
7. [ ] Submit the **YouTube API Services compliance audit** form. This is separate from OAuth
       verification and it is the one that matters most: until the project passes it, every video
       uploaded through your app is locked to private, whatever visibility the user chose.
8. [ ] For Google Sheets scheduling: IAM → Service accounts → create one → Keys → add a JSON key.
       Base64-encode the file (`base64 -w0 key.json`) into `GOOGLE_SERVICE_ACCOUNT_B64`.
       Your users then share their sheet with that service account's email address.
       (If you skip this, users must share their sheet as "Anyone with the link can view".)

### 3c. Pinterest

1. [ ] Create a Pinterest **Business** account and, at developers.pinterest.com, a new app.
       Wait for Trial access to be approved.
2. [ ] Add the redirect URI `https://app.example.com/api/oauth/pinterest/callback`.
3. [ ] Put the App ID and secret in `.env` as `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`.
4. [ ] On Trial access, Pins created through the API are sandbox Pins that only their creator can
       see, so set `PINTEREST_API_BASE=https://api-sandbox.pinterest.com` and test with your own
       account.
5. [ ] Record a demo video (login → connect Pinterest → the OAuth screen → schedule a Pin →
       the Pin on the board) and apply for **Standard access**.
6. [ ] After approval, set `PINTEREST_API_BASE=https://api.pinterest.com` and restart.

## 4. Payments

The app ships with a pluggable billing layer and a working "manual" gateway: the customer picks a
plan, sees your payment instructions (`BILLING_INSTRUCTIONS`, for example a bKash number), submits
the transaction ID, and you approve it in the Admin page, which starts 30 days of access.

- [ ] Write your payment instructions into `BILLING_INSTRUCTIONS`.
- [ ] Set plan names, prices, currency and limits in Admin → Plans.
- [ ] Decide on an automatic gateway. Stripe does not open accounts for Bangladesh-registered
      businesses, so the realistic options are a merchant-of-record service for international
      cards (Paddle, Lemon Squeezy; confirm they accept your business), a local gateway
      (SSLCommerz, bKash, aamarPay) for BDT, or Stripe through a foreign company.
      `src/lib/billing/gateway.ts` explains the two functions to implement.

## 5. Before you announce

- [ ] Test the whole pipeline with no platform approvals: set `ENABLE_MOCK_PROVIDER=true`,
      connect "Test network", schedule a post, watch it publish. Set it back to `false` for launch.
- [ ] For each real network: connect your own account, publish one post of each type
      (text, image, several images, video), and confirm it on the network.
- [ ] Remove an account and reconnect it; delete a test user account in Settings.
- [ ] Decide `TRIAL_DAYS` (0 turns the free trial off).

## What each network accepts

| Network | Text only | Images | Video | Needs |
|---|---|---|---|---|
| Facebook Page | yes | one or many | one | Page admin |
| Instagram | no | 1–10 (carousel) | Reel | Business/Creator account linked to a Page |
| YouTube | no | no | one | a title |
| Pinterest | no | one | one | a board; title recommended |

## Later, if you add more networks

- **LinkedIn**: personal posting is open to any app; company Page posting needs the Community
  Management API, which LinkedIn grants only to registered legal entities after a review.
- **TikTok**: posts stay private until the app passes TikTok's Content Posting API audit.
- **X (Twitter)**: the API is pay-per-use (about $0.015 per post, $0.20 for a post containing a
  link), so it has to be priced into your plans.

Adding one means writing a provider file like `src/lib/providers/pinterest.ts` and registering it
in `src/lib/providers/index.ts`.
