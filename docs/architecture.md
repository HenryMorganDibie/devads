# Architecture

## Why this shape

DevAds is one backend (`services/ad-server`) serving multiple clients: the VS
Code extension today, and a CLI / JetBrains plugin / browser extension later.
All money, eligibility, and fraud logic lives in that one service so no
client is ever trusted for accounting -- the extension asks "is there an ad
for this context?" and reports "here's what happened," and the server
decides everything that touches revenue.

```
apps/
  web/                    Next.js: landing page + developer dashboard
  advertiser-dashboard/   Next.js: campaign creation & management
  admin-dashboard/        Next.js: approval queue, platform overview
  vscode-extension/       VS Code extension (first client)

packages/
  database/    Prisma schema, migrations, seed data
  shared/      Money utilities (integer cents), Zod DTOs, Payout/BillingProvider
  auth/        Password hashing, session JWTs, magic links, device-auth codes
  targeting/   Pure eligibility/targeting/frequency-cap/budget functions
  ad-sdk/      (reserved for a future shared client SDK; the extension
               currently has its own thin adClient.ts -- see Roadmap)

services/
  ad-server/   Fastify API: /api/v1/{auth,ads,events,earnings,campaigns,admin,developers}
```

## Data flow: one ad request

```
VS Code extension (CommandTracker: minimumWaitSeconds elapsed, still running)
        |
        v
POST /api/v1/ads/select  { context: { developerId, language, ... } }
        |
        v
ad-server re-validates eligibility server-side (developer.adsEnabled),
loads APPROVED campaigns + targets + budget usage + frequency-cap history
from Postgres, runs packages/targeting's selectAd() pure pipeline
        |
        v
if a candidate wins: server creates the AdImpression + IMPRESSION AdEvent
rows itself (client never controls the event id used for accounting)
        |
        v
response: { ad: { impressionId, campaignId, creativeId, headline, ... } }
        |
        v
extension re-checks the command is STILL running before showing anything
        |
        v
StatusBarItem shown -> command ends/dismissed -> POST /api/v1/events
(VIEW_COMPLETE with viewDurationMs) -> only if >= minimum qualifying
duration does the server write a developer_earnings_ledger entry
```

## Money

Every monetary column is an integer count of minor currency units (cents)
plus an explicit currency code (`packages/shared/src/money.ts`). Splitting
CPM revenue between developer and platform uses basis-points arithmetic that
never loses or fabricates a cent (`splitByBps`). Ledger writes
(`developer_earnings_ledger`, `campaign_spend`) happen inside Prisma
transactions, and `ad_events.event_id` / `developer_earnings_ledger.impression_event_id`
are unique, so a retried or duplicated client request is idempotent rather
than double-counted.

## Fraud resistance (MVP-level)

- Impressions and events are server-created/validated, never client-asserted.
- `ad_events.event_id` is unique -> duplicate reports are no-ops.
- A `VIEW_COMPLETE` only pays out if `viewDurationMs` clears
  `MIN_VIEW_DURATION_MS` (default 1500ms).
- Frequency caps (per-campaign and global, per developer per day) are
  enforced server-side against real impression history, not client state.
- `fraud_flags` table exists for the admin review queue; automated
  anomaly-velocity detection is not yet implemented (see Roadmap).

## Why Prisma, Fastify, one ad-server (not per-app API routes)

- **Prisma** over Drizzle: migration ergonomics and a mature seed-script
  story mattered more than query-builder ergonomics for this MVP; both were
  acceptable per the original spec.
- **Fastify** for the ad-server: it's the one service every client (three
  Next.js apps' server-side calls, the extension, a future CLI) talks to, so
  it's kept framework-light and dependency-minimal rather than coupled to
  Next.js's request lifecycle.
- **One ad-server, not three sets of Next.js API routes**: money and
  fraud-sensitive logic living in exactly one place is easier to audit than
  the same logic re-implemented three times.

## Roadmap (not built in this pass, why)

- **CLI, JetBrains, browser extension**: documented surfaces, not built --
  the spec explicitly says don't build every client in v1. The ad-server's
  API is client-agnostic already; a CLI would reuse `adClient.ts`'s shape
  almost as-is.
- **Video ads in the extension**: the backend/dashboards support the VIDEO
  creative type end-to-end, but the v1 StatusBarItem surface can only render
  text -- VS Code's UX guidance discourages a webview for promotional
  content, and a webview was the only way to autoplay video. Left for a
  richer future surface (e.g. a notification/panel API if VS Code adds one
  suited to this).
- **Real S3/Stripe**: `PayoutProvider`/`BillingProvider` are real Stripe SDK
  implementations gated behind env vars (`PAYOUT_PROVIDER=stripe` +
  `STRIPE_SECRET_KEY`), defaulting to a deterministic `Mock` implementation.
  Object storage is written against the S3 API via MinIO locally; swapping
  to AWS S3 is a config change, not a code change -- but the creative
  upload UI itself (drag-and-drop -> presigned URL -> MinIO/S3) is not
  wired up yet; campaigns currently store `imageKey`/`videoKey` as plain
  strings entered via the API.
- **Automated fraud anomaly detection** (velocity/device-fingerprint
  scoring beyond min-view-duration + idempotency + frequency caps): the
  `fraud_flags` table and admin review UI hook exist; the detection rules
  that would populate it do not yet.
- **CLI `devads run <command>`**: mentioned in the original spec as a
  possible future command, intentionally not built.
