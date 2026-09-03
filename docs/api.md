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

- The client is **never** authoritative for money: impressions, events, and
  earnings ledger entries are all created or validated server-side.
- Event reporting is idempotent via a client-generated `eventId` with a
  unique DB constraint -- retries are safe no-ops, not double-counts.
- Money fields are always integer minor units (`amountCents`,`cpmCents`, ...)
  plus a `currency` code -- never a float.
- `/api/v1/campaigns` responses never expose other advertisers' data;
  ownership is scoped by `advertiserId` on every query. Admin endpoints are
  separate (`/api/v1/admin/*`) and unauthenticated-admin-check is a known
  gap for a production deploy (see below).

## Authorization

`/api/v1/developers/*` (preferences, data export, account deletion) and
`/api/v1/earnings/*` (balance, payout requests) require a valid session
bearer token (`Authorization: Bearer <token>`) **and** verify the session's
user owns the developer profile being accessed -- enforced via a Fastify
`preHandler` hook (`services/ad-server/src/lib/authGuard.ts`), not just by
the caller happening to supply the right id. `/api/v1/admin/*` requires an
ADMIN-role session. Covered by `authGuard.integration.test.ts` (401 with no
token, 403 for a signed-in non-owner, 403 for a non-admin hitting admin
routes, 200 for the actual owner).

**Known remaining gap:** `/api/v1/campaigns/*` and `/api/v1/advertisers/*`
do not yet verify the caller's session against the `advertiserId` supplied
in the request -- ownership is currently enforced only by requiring the
correct id, the same pattern the routes above used to have. This is
acceptable for local demo/dev use but should get the same
`requireSession` + ownership-check treatment before a real deployment.
Flagging this explicitly rather than leaving it silently discovered later.
