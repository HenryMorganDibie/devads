# API

The ad-server exposes a single versioned REST API at `/api/v1/*`. Full
machine-readable spec: [openapi.yaml](./openapi.yaml).

## Groups

| Prefix | Purpose |
|---|---|
| `/api/v1/auth/*` | Developer/advertiser signup+login, admin login, device-pairing (VS Code sign-in) |
| `/api/v1/ads/select` | Server-authoritative ad selection (called by clients) |
| `/api/v1/events` | Idempotent impression/click/dismiss/view-complete reporting |
| `/api/v1/earnings` | Developer earnings rollup + payout requests |
| `/api/v1/developers/:id/*` | Preferences, data export, account deletion |
| `/api/v1/advertisers/signup`, `/api/v1/campaigns/*` | Advertiser account + campaign CRUD |
| `/api/v1/admin/*` | Campaign approval queue, advertiser suspension, platform overview |

## Design notes

- The client is **never** authoritative for money or identity: impressions,
  events, and earnings ledger entries are all created server-side, and the
  caller's identity for every accounting-relevant route is derived from
  their verified session token, never from an id in the request body.
- Event reporting is idempotent via a client-generated `eventId` with a
  unique DB constraint -- retries are safe no-ops, not double-counts.
- Money fields are always integer minor units (`amountCents`,`cpmCents`, ...)
  plus a `currency` code -- never a float.
- Concurrency-safe by construction, not by luck: campaign spend and
  developer earnings accrue via a Postgres row lock (acquired by the first
  `UPDATE` inside each accounting transaction) that serializes concurrent
  writers to the same campaign/developer row; payout requests acquire a
  `pg_advisory_xact_lock` keyed on `developerId` so two concurrent
  withdrawal requests can't both read the same "available balance" and
  both get paid. Each guarantee has a dedicated concurrent-request
  integration test (see `carryPrecision`, `budgetEnforcement`, and
  `payouts` test files) that fires real simultaneous HTTP requests against
  a live Postgres and asserts the totals are exact -- not just correct
  when called one at a time.
- Campaign budgets are enforced at spend-commit time (inside the same
  locked transaction as the spend write), not only as a best-effort
  pre-check at ad-selection time. Selection-time budget filtering is a
  fast optimization that usually stops serving an exhausted campaign
  before another impression is even requested; the authoritative check
  happens when a qualified view is about to actually charge the campaign,
  so a handful of impressions that were "in flight" when the budget ran
  out can't blow through it -- any such race is absorbed by the platform,
  bounded to at most one impression's cost per concurrent request, rather
  than overcharging the advertiser.

## Authorization

Every route below requires a valid session bearer token
(`Authorization: Bearer <token>`) **and** verifies the session's user
actually owns the resource being accessed -- enforced via a Fastify
`preHandler` hook (`services/ad-server/src/lib/authGuard.ts`), not just by
the caller happening to supply the right id in the request:

- `/api/v1/ads/select`, `/api/v1/events`: `developerId` is derived from
  `session.sub` (via the developer profile owned by that user), never taken
  from the request body -- the body's `context.developerId` /
  `body.developerId` are accepted for schema-shape compatibility but
  **ignored for authorization**. Without this, any caller could request
  ads, consume another developer's frequency cap, or fabricate a qualified
  view crediting another developer's earnings ledger.
- `/api/v1/developers/*` (preferences, data export, account deletion),
  `/api/v1/earnings/*` (balance, payout requests): require the session's
  user to own the developer profile being accessed.
- `/api/v1/campaigns/*` (create, add creative, upload, submit, list),
  `/api/v1/advertisers/signup`: require the session's user to be a member
  (`advertiser_members`) of the `advertiserId` being acted on. Uploads are
  further gated to `DRAFT` campaigns only, and validated server-side by
  MIME type + size (PNG/JPEG/WebP/GIF up to 5MB, MP4/WebM up to 25MB) --
  never trusted from the client's declared content type.
- `GET /api/v1/creatives/:id/url`: requires any valid session (not
  advertiser-membership-scoped) and returns a time-limited signed URL for
  the creative's stored file -- creatives aren't sensitive per-advertiser
  data, but the bucket itself is never public.
- `/api/v1/admin/*`: requires an ADMIN-role session.

Covered by `authGuard.integration.test.ts` (401 with no token, 403 for a
signed-in non-owner/non-member, 403 for a non-admin hitting admin routes,
404 when a session resolves to no matching profile, 200 for the actual
owner) plus dedicated cases in `ads.integration.test.ts`.

## Rate limiting

Every route has a default limit of 300 requests/minute per IP
(`@fastify/rate-limit`, global). Auth endpoints that are natural
brute-force targets (`/auth/login`, `/auth/admin-login`, `/auth/signup`,
`/advertisers/signup`) have a much stricter 10/minute per-route limit.
Exceeding a limit returns `429`. Covered by `rateLimit.integration.test.ts`.

**Known remaining gap:** there's no CSRF protection layer (acceptable for
a bearer-token API consumed by native/SPA clients that don't rely on
cookies for auth, but worth an explicit look before handling real payment
flows). CORS is currently wide open (`origin: true`) for local multi-port
dev convenience and must be locked down to known origins before a real
deployment.
