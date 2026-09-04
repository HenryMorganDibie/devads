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
- `/api/v1/campaigns/*` (create, add creative, submit, list),
  `/api/v1/advertisers/signup`: require the session's user to be a member
  (`advertiser_members`) of the `advertiserId` being acted on.
- `/api/v1/admin/*`: requires an ADMIN-role session.

Covered by `authGuard.integration.test.ts` (401 with no token, 403 for a
signed-in non-owner/non-member, 403 for a non-admin hitting admin routes,
404 when a session resolves to no matching profile, 200 for the actual
owner) plus dedicated cases in `ads.integration.test.ts`.

**Known remaining gap:** `GET /api/v1/admin/campaigns` and the advertiser
billing account are not yet covered by rate limiting, and there's no CSRF
protection layer (acceptable for a bearer-token API consumed by native/SPA
clients, but worth an explicit look before handling real payment flows).
CORS is currently wide open (`origin: true`) for local multi-port dev
convenience and must be locked down to known origins before a real
deployment.
