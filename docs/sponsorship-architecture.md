# Sponsorship architecture (Phase 1)

DevAds started as an ad platform for the VS Code extension (see
[architecture.md](./architecture.md)). The sponsorship domain is the
foundation for a broader, provider-agnostic **developer sponsorship**
platform: an organization funds offers, developers working in any client
see them during natural waits, and a qualifying completion earns the
developer a reward of some configured type.

Phase 1 is server-side only and strictly additive. No existing model,
route, test or the `selectAd()` pipeline was changed.

**No AI-provider partnership exists or is needed for any of this to work.**
Nothing in the schema, targeting, routes or tests names, requires or
branches on a particular AI company, sponsor or client. Client types like
`CLAUDE_CODE` or `GEMINI` exist only as labels a sponsor *may* use to
restrict eligibility. An empty list means every client.

## Domain model

| Model | Purpose |
|---|---|
| `DevelopmentSession` | Coarse "developer is working in client X" record: `clientType`, `clientVersion`, `status` (ACTIVE/ENDED), optional `activityCategory` (short slug only). It never stores source code, prompts, file names or command arguments. |
| `SponsorshipCampaign` | Owned by an `Advertiser`, which is the existing "organization that pays" identity. There is no parallel Sponsor model. Holds `objective`, `rewardType` + `rewardAmountUnits` (what the developer earns), `sponsorChargeCents` (what the sponsor pays), budgets, per-developer daily/lifetime reward caps, a display frequency cap, `eligibleClientTypes`, a date window, a DRAFT→SUBMITTED→APPROVED/REJECTED→PAUSED/ARCHIVED lifecycle, and `spendCarryMilliCents`. |
| `SponsoredOffer` | What gets shown: title, description, CTA URL, `requiredAction`, optional `expiresAt`, ACTIVE/INACTIVE. |
| `SponsorshipEvent` | Every display and interaction. `eventId @unique` provides idempotency, like `AdEvent.eventId`. `OFFER_DISPLAYED` is created only by the server. Client events carry the `displayEventId` they refer to. |
| `SponsorshipCampaignSpend` | Sponsor-side charges. It mirrors `CampaignSpend` and is kept separate from ad spend. |
| `DeveloperRewardLedger` | Source of truth for rewards. An EARNED row is keyed by `sponsorshipEventId @unique`, which is the server-issued display event. This matches `DeveloperEarningsLedger.impressionEventId`. |
| `DeveloperRewardWallet` | A maintained cache of the ledger balance, unique per `(developerId, rewardType)`. |

Three quantities are kept independent on purpose:

- **Reward** (`rewardType`, `rewardAmountUnits`): integer units of whatever the developer earns.
- **Sponsor charge** (`sponsorChargeCents`): integer cents billed to the sponsor.
- **Sponsor category** (`sponsorCategory`): optional, free-form and descriptive only. Core logic never requires it and has no hard-coded list of values. Its one use is matching against a developer's own `categoriesOptOut`.

Tests cover all three: `sponsorship.schemas.test.ts`, `sponsorshipEligibility.test.ts`, and the "sponsor-model independence" block in `sponsorshipCampaigns.integration.test.ts`. That block runs every reward type end to end with a null or arbitrary category, and checks through Prisma DMMF that no required campaign field needs a provider-specific value.

## Relationship to the ad domain

| Concern | Ads | Sponsorships |
|---|---|---|
| Who pays | `Advertiser` | same `Advertiser` |
| Who earns | `DeveloperProfile` | same `DeveloperProfile` |
| Campaign | `Campaign` | `SponsorshipCampaign` |
| Server-issued "shown" record | `AdImpression` + IMPRESSION `AdEvent` | `OFFER_DISPLAYED` `SponsorshipEvent` |
| Payable action | qualifying `VIEW_COMPLETE` | `OFFER_COMPLETED` |
| Spend | `CampaignSpend` | `SponsorshipCampaignSpend` |
| Developer value | cents in `DeveloperEarningsLedger` | reward units in `DeveloperRewardLedger` + wallet |
| Selection | `selectAd()` | `selectSponsoredOffer()` |

The two domains share identities, integrity techniques and the developer's
existing opt-in (`DeveloperProfile.adsEnabled`) and category opt-outs. They
share no rows and no accounting. Ad earnings and payouts are unaffected by
sponsorship rewards, and sponsorship rewards are unaffected by ad earnings
and payouts.

## Integrity model (inherited from the ad system)

- **Server authority.** The developer comes from the verified session only.
  The server reads reward amount, reward type, charge, caps and liveness
  from the database. Request schemas are non-strict Zod objects, so a
  client-sent `rewardAmountUnits` is stripped, and `metadata` is stored for
  analytics only. A test sends spoofed amounts and asserts they are ignored.
- **Idempotency through DB constraints.** `sponsorship_events.eventId` is unique,
  so replaying a request is a no-op. `developer_reward_ledger.sponsorshipEventId`
  is unique on the display event, so a re-keyed completion for the same
  display cannot reward twice.
- **Completion transaction** (`POST /api/v1/sponsorships/events`, `OFFER_COMPLETED`). All steps run in one `prisma.$transaction`:
  1. Insert the completion event.
  2. `UPDATE` the campaign's `spendCarryMilliCents`. This takes the campaign row lock, as `events.ts` does, so concurrent completions for a campaign run one at a time.
  3. Re-check liveness (status, date window, offer status and expiry) and the developer's daily/lifetime reward caps under the lock. These are **hard** limits: a rejection rolls back everything and returns 409.
  4. Resolve the milli-cent carry and write `SponsorshipCampaignSpend`.
  5. Write the EARNED ledger row.
  6. Upsert the wallet with a native `INSERT ... ON CONFLICT`, so a developer's first two rewards of one type from different campaigns can't race.
- **Budget is a soft cap**, the same as for ads. `GET /sponsorships/offer` filters out campaigns whose next charge would exceed budget. In a race, completions for displays that were already served are still **rewarded**. Only the `SponsorshipCampaignSpend` row is skipped once the budget is used up, so the platform absorbs the overage instead of overcharging the sponsor. The race test asserts spend ≤ budget *and* that every completion was rewarded.
- **Carry.** The per-completion charge is whole cents today, so the carry
  resolves with no remainder. It still runs through `resolveCarry()`, so
  fractional pricing (for example, CPM-style awareness objectives) can be
  added without a schema change.
- **Rewards are granted APPROVED straight into `availableUnits`.** Phase 1 has no
  review or hold period. `pendingUnits` and `RewardStatus.PENDING` are the
  hook for adding one later.
- **Wallet reads** run under `pg_advisory_xact_lock(hashtext('reward-wallet:' || developerId))`.
  That key is separate from the payout lock. They return the cached balance
  next to a ledger-recomputed `ledgerAvailableUnits`. A future redemption
  route must take the same lock and follow the `/earnings/payout` sequence:
  recompute server-side, write a PENDING row first, call the provider, then
  update the status.
- **Database CHECK constraints** (`20260928232400_sponsorship_check_constraints`)
  require non-negative charges, budgets, caps, carry, ledger amounts and wallet
  balances, a positive reward amount, and `endDate > startDate`.
- **No RLS.** Every route checks ownership explicitly. Developers can only
  touch their own sessions, displays and wallet (403 otherwise). Sponsors
  must be an `AdvertiserMember` of the campaign's advertiser. Admin routes use
  `requireAdmin`.

## API (Phase 1)

Developer (session required):

- `POST /api/v1/sessions`: start a session `{ clientType, clientVersion?, activityCategory? }`.
- `POST /api/v1/sessions/:id/end`: end a session. Owner only, idempotent.
- `GET /api/v1/sponsorships/offer?clientType=...|sessionId=...`: server-side selection. If a session is given, its `clientType` is used. The response is `{ offer: { displayEventId, offerId, campaignId, title, description, ctaUrl, requiredAction, rewardType, rewardAmountUnits, expiresAt } | null }`.
- `POST /api/v1/sponsorships/events`: report an interaction `{ eventId, type: OFFER_SKIPPED|OFFER_OPENED|OFFER_INTERACTED|OFFER_COMPLETED, displayEventId, sessionId?, metadata? }`.
- `GET /api/v1/wallet?developerId=...`: owner only. Returns `{ balances: [{ rewardType, availableUnits, pendingUnits, ledgerAvailableUnits }], recentLedger }`.

Sponsor (session + advertiser membership):

- `POST /api/v1/sponsorship-campaigns`: create a campaign in DRAFT. Offers can be included inline.
- `PATCH /api/v1/sponsorship-campaigns/:id`: edit, DRAFT only.
- `POST /api/v1/sponsorship-campaigns/:id/offers`: add an offer, DRAFT only.
- `POST /api/v1/sponsorship-campaigns/:id/submit`: submit. Needs at least one active offer.
- `GET /api/v1/sponsorship-campaigns?advertiserId=...`: list campaigns with stats (displays, completions, rewardsGranted, spendCents).

Admin (`requireAdmin`):

- `GET /api/v1/admin/sponsorship-campaigns?status=...`
- `POST /api/v1/admin/sponsorship-campaigns/:id/approve | reject | pause`

The DTOs live in `packages/shared/src/sponsorship.ts`. Prisma rows are
always mapped explicitly before they are returned, so internal fields such
as `spendCarryMilliCents` are never exposed.

Pure selection lives in `packages/targeting/src/sponsorshipEligibility.ts`.
The route uses those functions both at selection time and inside the
completion transaction, so the two can't drift apart.

## Deferred (not in Phase 1)

- **Redemption.** Only the `RedemptionProvider` interface exists (in
  `packages/shared/src/providers.ts`), plus the `REDEEMED` ledger entry type.
  There is no implementation, factory, env var or route.
  *Built in Phase 7 with a manual (operator-fulfilled) provider; see
  [redemption.md](./redemption.md).*
- **Reversals, expiry and adjustments.** The entry types exist, but no code
  writes them. The ledger column `sponsorshipEventId` is nullable so those
  entries can exist later.
- **Fraud detection.** `services/fraud` is still an empty stub. Abuse
  protection in Phase 1 is DB uniqueness, row locks, per-developer caps,
  server-issued displays and ownership checks. There is no minimum dwell
  time between display and completion, and no completion proof beyond the
  client's report. Both are fraud-phase work.
- **`OFFER_REQUESTED` events.** They are not recorded, because an event
  requires an offer. Fill-rate analytics can add them later.
- **Protocol/SDK package, VS Code extension changes and adapters for other
  clients** (Claude Code, Codex, Gemini, Cursor, OpenCode, Aider, custom or
  local agents). None exist, not even as stubs. *SDK added in Phase 2, VS
  Code client in Phase 3, adapter runtime and boundary in Phase 6; adapters
  for other clients still do not exist (see [adapters.md](./adapters.md)).* Adapters would authenticate
  the same way the VS Code extension does today (session bearer token via
  device auth). No API-key or machine-auth mechanism exists. That is a known
  gap for non-interactive agents.
- **Dashboard UI** for sponsorship campaigns, the admin queue and the
  developer wallet. The endpoints exist. The Next.js apps don't call them yet.
  *Developer pages added in Phase 4; sponsor and admin pages in Phase 5.*
- **Separate sponsorship opt-in.** Phase 1 reuses `DeveloperProfile.adsEnabled`
  as the developer's single "show me sponsored content" switch.

## Schema-change note

Prisma requires back-relation fields, so `DeveloperProfile` and `Advertiser`
each gained relation-only fields. These have no columns, and the migration
does not alter either table. Both sponsorship migrations only create new
enums, tables, indexes, foreign keys and CHECK constraints:
`20260928232350_sponsorship_domain` and `20260928232400_sponsorship_check_constraints`.

## Protocol SDK (Phase 2)

`packages/ad-sdk` (`@devads/ad-sdk`) is the stable client boundary for the
sponsorship API. The directory had been reserved for a shared client SDK and
was empty, so Phase 2 fills it instead of adding a second package. Clients
integrate against `DevAdsClient` and never hand-roll HTTP calls, know
endpoint paths, or see database types.

| SDK method | Wraps | Notes |
| --- | --- | --- |
| `startSession(context)` | `POST /api/v1/sessions` | `clientType`, `clientVersion`, `activityCategory` only |
| `endSession(sessionId)` | `POST /api/v1/sessions/:id/end` | idempotent server-side |
| `requestSponsoredOpportunity(context)` | `GET /api/v1/sponsorships/offer` | resolves `null` when no offer; a non-null offer is already recorded as `OFFER_DISPLAYED` |
| `reportOfferEvent(event)` | `POST /api/v1/sponsorships/events` | `OFFER_SKIPPED` / `OFFER_OPENED` / `OFFER_INTERACTED` only |
| `completeQualifyingAction(event)` | `POST /api/v1/sponsorships/events` | `OFFER_COMPLETED`, correlated by the offer's `displayEventId` |
| `getWallet(developerId?)` | `GET /api/v1/wallet` | developer id from the argument or `credentials.developerId` |

Contract rules:

- **One source of truth for shapes.** Every request and response type is an
  alias of a DTO in `packages/shared/src/sponsorship.ts`. The client type is
  the shared `DevClientType` enum (re-exported as `DEV_CLIENT_TYPES`), so no
  Prisma type reaches a client package.
- **Validated both ways.** Inputs are parsed with the shared request schemas
  before anything is sent. Only schema fields are sent, and unknown keys are
  dropped. Every 2xx body is parsed with the shared response schema, and a
  body that doesn't match (for example a fractional reward amount or an
  unknown reward type) rejects with `invalid_response` and is never returned.
- **Coarse metadata only.** The public input types have no field for source
  code, prompts, model output, file paths, repository contents or secrets.
  The free-form `metadata` field that the event schema allows is not exposed
  by the SDK in this phase.
- **Server-authoritative.** The SDK makes no economic decision. It cannot
  report `OFFER_DISPLAYED` or `OFFER_REQUESTED`, and it never sends a reward
  amount or type. Event ids are idempotency keys: the SDK generates one
  (`crypto.randomUUID()`) unless the caller passes one, and returns it so a
  retry can reuse it.
- **Existing auth only.** The constructor takes `credentials.token`, which is
  the session bearer token from the existing device-auth / login flow, as a
  string or an async provider that is re-read on every call. There is no new
  API-key or machine-auth mechanism, so the non-interactive-agent auth gap
  noted above still applies.
- **Typed failures.** Every method resolves with validated data or rejects
  with a `DevAdsError` whose `code` is one of `invalid_request`,
  `unauthenticated`, `network`, `timeout`, `rejected` (non-2xx, with `status`
  and the server's `reason`, such as `developer_daily_cap_reached`) or
  `invalid_response`. Adapters choose how to degrade. The existing extension
  policy is that ad delivery must never disrupt the developer's work.
- **Transport.** The client uses a structural `fetch` (default
  `globalThis.fetch`, injectable) with a per-request timeout that actually
  aborts the request. Endpoint paths live only in the SDK's internal route
  table, which is not exported. Nothing in the public interface names VS
  Code or any other specific tool.

**Status of clients.** The VS Code extension consumes the SDK (Phase 3).
An adapter for another tool (Claude Code, Codex, Gemini, Cursor, OpenCode,
Aider, or a custom or local agent) would build against this same client and
the Phase 6 adapter runtime. None of those adapters exist, not even as
stubs, and no AI-provider integration exists. The only trace of those tools
is the shared `DevClientType` enum value each would send.

## VS Code extension as the first protocol client (Phase 3)

The VS Code extension (`apps/vscode-extension`) is the first real client of
the DevAds Protocol. It consumes `@devads/ad-sdk` as-is for the sponsorship
domain. Its existing standard-ad flow (`AdClient` calling
`/api/v1/ads/select` and `/api/v1/events`, `CommandTracker`, the
eligibility gate and the `StatusBarAd` card) is unchanged and does not
depend on any sponsorship code.

| Piece | File | What it does |
| --- | --- | --- |
| Client factory | `src/sponsorshipClient.ts` | Builds a `DevAdsClient` with `clientType: "VS_CODE"`, the extension's own `package.json` version, and the existing device-auth session token (re-read from SecretStorage on every call). No new auth. |
| Session lifecycle | `src/sponsorshipSession.ts` | `startSession()` on activation when already signed in, after a successful **DevAds: Sign In**, and when `devads.enabled` and `devads.sponsorship.enabled` are both turned on. `endSession()` on deactivation, on **Sign Out** (before the token is deleted) and when either setting is turned off. |
| Sponsored offer | `src/sponsoredOffer.ts`, `src/statusBarSponsoredOffer.ts` | Asks `requestSponsoredOpportunity()` on the same terminal-wait signal the standard flow uses, and shows the result in its own status bar item labelled "Sponsored" with the reward. Wires skip, interact and open to `reportOfferEvent()` and completion to `completeQualifyingAction()`, all correlated by the offer's `displayEventId` and the session it was displayed under. |
| Wallet | `src/rewardWallet.ts` | **DevAds: Show Reward Wallet** calls `getWallet()` and lists available and pending units per reward type in a Quick Pick. |

Behavior:

- **Same trigger, separate path.** The sponsorship pass runs after the
  standard ad pass in the same polling tick and only reads the
  `CommandTracker` (elapsed time, still running). It keeps its own
  once-per-command bookkeeping, so it never consumes or changes the
  standard flow's request. If a standard ad is already showing for a wait,
  no sponsored offer is requested for that wait, so there is one promotional
  surface at a time. Like standard cards, an offer is only shown if the
  command is still running when the response arrives, and it disappears
  when the command ends (without reporting a skip).
- **Failure tolerant.** Every sponsorship call is wrapped. A network error,
  timeout, server rejection or malformed response means no offer, no
  session or no wallet, logged to the "DevAds Sponsorship" output channel.
  It never throws into activation, commands or the standard ad flow. If the
  session can't be started, offer requests fall back to the client type
  alone. A `session_ended` / `forbidden` reply drops the cached session so
  the next wait starts a fresh one.
- **Qualifying action is an explicit user action only.** The only thing
  the extension counts is the developer choosing **View offer** and VS Code
  confirming the link actually opened. That reports `OFFER_OPENED`, and,
  if the offer has no further `requiredAction`, `completeQualifyingAction()`.
  When a sponsor states a further required action (free text such as
  "create a project"), the extension cannot observe it without invasive
  tracking, so it reports `OFFER_OPENED` only and does not claim
  completion. There is no process inspection, SDK-init or deploy
  detection, and no heuristic. The server still decides whether a reward is
  granted, and caps or campaign-ended refusals are final for that display.
- **Privacy.** The sponsorship path sends strictly less than the standard
  flow: client type, extension version, session id, the server-issued
  `displayEventId`, generated event ids, and (for the wallet) the developer
  id from the existing sign-in. It does not use `contextDetect.ts` at all:
  no language, runtime, platform, command name, file path, source code,
  prompt content or secret is passed to the SDK. Sponsor-provided text is
  rendered escaped, and the tooltip only trusts the offer's own open/skip
  commands.
- **Opt-out.** `devads.sponsorship.enabled` (default on) turns the whole
  sponsorship path off without uninstalling, and offers also require the
  existing `devads.enabled`. The authoritative opt-in is still server-side:
  the offer endpoint refuses offers to developers whose
  `DeveloperProfile.adsEnabled` is off, so the client does not duplicate
  that check.

**The adapter pattern.** This is the shape any future DevAds client would
follow: build a `DevAdsClient` with its own `DevClientType` value and
version, reuse the user's existing session token, open and close a
development session around its lifetime, request an offer only at a natural
wait it can already observe, report interactions against `displayEventId`,
count only qualifying actions the tool can honestly observe, and degrade to
"no offer" on any failure. Only the VS Code extension does this today.
Adapters for Claude Code, Codex, Gemini, Cursor, OpenCode, Aider or custom
and local agents are not built, not even as stubs. *Phase 6 moved the
host-agnostic part of this pattern into the SDK; see below.*

Known gaps found while integrating (not patched in the SDK or server):

- `SponsoredOfferCandidate` has no sponsor or advertiser display name, so
  the card shows the offer title, description and reward, not a sponsor
  name.
- `requiredAction` is free text, with no machine-readable "opening the link
  is the qualifying action" flag. The extension infers it from an empty
  `requiredAction`, which is a client-side policy decision.
- `OFFER_DISPLAYED` is recorded when the server selects an offer, not when
  a client renders it. An offer that arrives after the command already
  ended is dropped by the extension but still counts as displayed (same
  timing model as standard-ad impressions).

## Developer-facing web pages (Phase 4)

Phase 4 adds the first sponsorship UI to `apps/web`, the developer
dashboard. It is additive: the earnings, payout, preferences and device
pairing pages keep their logic, and the only change to an existing page is
a small link row (`components/DeveloperNav.tsx`) under the dashboard header
so the new pages are reachable. The new pages use the same data-fetching
and auth pattern as the dashboard: client components, the stored session
from `lib/api.ts` (redirect to `/login` without a `developerId`), and the
shared `apiGet` helper with the session's bearer token. They consume only
routes Phase 1 already exposes. No server route, Prisma model or SDK method
was added.

| Page | File | Data |
| --- | --- | --- |
| `/rewards` ("Developer Rewards") | `app/rewards/page.tsx`, `components/RewardWalletView.tsx`, `lib/rewards.ts` | `GET /api/v1/wallet?developerId=...` |
| `/sponsorships` ("Sponsorships") | `app/sponsorships/page.tsx`, `components/SponsorshipsView.tsx`, `lib/sponsorships.ts` | `GET /api/v1/developers/:id/preferences` (the `adsEnabled` opt-in) |

**Reward wallet.** One card per reward type with available and pending
units and a "This month: +680 earned  -400 redeemed" line, followed by the
ledger history (date, reward type, entry type, signed amount, status).
Units are the server's opaque integers and are formatted by grouping their
digits, never by converting to a fractional value. Signs follow the
server's ledger-balance rule: EARNED and ADJUSTMENT credit, REVERSED,
REDEEMED and EXPIRED debit. "This month" is the current UTC month, and
earned counts EARNED rows that are APPROVED or PENDING. The response is
checked structurally (known enums, integer units) before rendering. A
cache/ledger disagreement (`availableUnits` vs `ledgerAvailableUnits`) is
shown as a reconciliation note instead of being hidden. The page states
plainly that redemption isn't available yet.

**Sponsorships page.** Explains that sponsorships are paid placements,
separate from standard ads and from organic content, and uses a visible
"Sponsored" label. It shows whether the developer's sponsored-content
switch is on (the shared `adsEnabled` flag), where offers appear today (the
VS Code extension's "Sponsored" status bar item), and links to the wallet.
Nav and page copy say "Sponsorships" and "Developer Rewards", never "Ads".

Every state is handled on both pages: loading, expired session (sign-in
link), request/network/malformed-response errors (message plus retry) and
empty (no rewards yet / no browsable sponsorships). Tests live in
`apps/web/__tests__` and run under vitest, which `apps/web` now uses like
the other workspace packages; views are rendered with
`react-dom/server`, so no DOM test library was added.

Known gaps (not patched in this phase):

- **No read-only offer listing.** `GET /api/v1/sponsorships/offer` is a
  selection call: a non-null response records a server-side
  `OFFER_DISPLAYED`, counts against the developer's per-campaign daily
  display cap and the sponsor's display stats, and needs a `DevClientType`,
  which has no web value. Calling it from a web page would spend real
  display budget on a surface that can't complete the offer, so the
  Sponsorships page never calls it and shows an honest "no list to browse"
  state. A real marketplace needs a side-effect-free endpoint that lists
  the live offers a developer is eligible for, and a decision on whether
  the web is a client that may display and complete offers.
  *Resolved by the read-only listing below; the web still does not display
  or complete offers.*
- **Ledger window.** The wallet returns the 50 most recent ledger rows with
  no pagination. History shows only that window, and the monthly totals
  are marked as possibly incomplete when all 50 rows fall in the current
  month.
- **No sponsor or campaign names** in ledger entries (only `campaignId`),
  so history rows can't say which sponsorship a reward came from.
- **No separate sponsorship opt-in.** The page reflects `adsEnabled`, which
  also controls standard ads.

## Read-only offer listing

`GET /api/v1/sponsorships/offers?clientType=...` (plural, session
required) lists the live sponsored offers the signed-in developer is
eligible for. It is the browsing counterpart to the selection endpoint
`GET /api/v1/sponsorships/offer` (singular), which is unchanged and remains
the only way an offer is served, displayed and made completable.

| | `/sponsorships/offer` (select) | `/sponsorships/offers` (list) |
| --- | --- | --- |
| Result | at most one offer, with a `displayEventId` | every eligible offer, no `displayEventId` |
| Writes | `OFFER_DISPLAYED` event | nothing |
| Display frequency cap | checked and consumed | not checked, not consumed |
| Sponsor display stats | counted | untouched |
| `clientType` | required (or via `sessionId`) | optional filter |
| Callers | VS Code extension | `apps/web` Sponsorships page |

Response: `{ sponsoredContentEnabled, offers: [{ offerId, campaignId,
title, description, ctaUrl, requiredAction, rewardType, rewardAmountUnits,
expiresAt, eligibleClientTypes }] }` (`SponsoredOfferListResponseSchema`,
composed from the existing offer schema minus `displayEventId`). Sponsor
charge, budgets and caps are never exposed. When the developer has
sponsored content off, `offers` is empty and `sponsoredContentEnabled` is
false.

The route lives in its own file
(`services/ad-server/src/routes/sponsorshipOffers.ts`) and only reads:
`loadSponsorshipCandidates`, `loadSponsorshipBudgetUsage` and
`loadRewardCounts` in `lib/sponsorshipCandidates.ts` are
`findMany`/`groupBy` queries with no writes, so they are reused as-is. The
filter is `listEligibleSponsoredOffers` in `@devads/targeting`, built from
the same predicates as `selectSponsoredOffer` (live, opt-in, category
opt-out, client type, budget remaining, developer reward caps) with two
deliberate differences: it ignores the display frequency cap (a listing is
not a display, and the cap only limits how often an offer is served), and
it only filters by client type when one is given. As with selection, only
each campaign's oldest active offer is considered, so the list matches
what could actually be served. The list is capped at 50 offers.

SDK: `DevAdsClient.listSponsoredOpportunities({ clientType? })`, defaulting
to the client's configured client type; a client without one lists offers
for every client type. The VS Code extension does not call it.

Web: the Sponsorships page now loads the preferences and the listing as
two independent requests (either can fail without hiding the other) and
renders each offer's reward, required action, expiry and where it can be
received, flagging offers limited to tools DevAds doesn't support yet. It
calls the endpoint through `apiGet` with a structural response check, like
the rewards page, rather than through the SDK (the SDK is built to
`dist/` and isn't a web dependency). The page doesn't link to the
sponsor's URL: opening an offer from the web isn't a tracked display and
can't earn a reward.

## Sponsor and admin dashboards (Phase 5)

Phase 5 adds the Sponsorship UI to `apps/advertiser-dashboard` (sponsors)
and `apps/admin-dashboard` (DevAds admins). It consumes only the routes
Phase 1 already exposes. No server route, Prisma model, migration or SDK
method was added, and the Ad Campaign pages keep their logic: the only
changes to existing pages are a "Sponsorships" link in the advertiser
Campaigns header and in the admin nav (Campaigns, Advertisers, Overview).
Both apps' Tailwind `content` now also scans `components/`, as `apps/web`
already did.

The pages follow each app's existing pattern (client components, the
stored session from `lib/api.ts` with a redirect to `/login`, the shared
`apiGet`/`apiPost` helpers with the bearer token) and Phase 4's structure:
loaders and pure helpers in `lib/sponsorships.ts` that never throw and check
every response structurally, presentational views in `components/`, and
thin pages in `app/`. Copy says "Sponsorship" and "Developer Reward" and
keeps both apart from "Ad Campaign" (CPM, impressions).

| App | Page | Files | Routes used |
| --- | --- | --- | --- |
| advertiser | `/sponsorships` (list) | `app/sponsorships/page.tsx`, `components/SponsorshipCampaignsView.tsx` | `GET /api/v1/sponsorship-campaigns?advertiserId=`, `POST .../:id/submit` |
| advertiser | `/sponsorships/new` | `app/sponsorships/new/page.tsx`, `components/SponsorshipCampaignForm.tsx`, `components/SponsoredOfferFields.tsx` | `POST /api/v1/sponsorship-campaigns` (optional first offer inline) |
| advertiser | `/sponsorships/[id]` | `app/sponsorships/[id]/page.tsx`, `components/SponsorshipCampaignDetail.tsx` | the list route, `POST .../:id/offers`, `POST .../:id/submit` |
| admin | `/sponsorships` | `app/sponsorships/page.tsx`, `components/AdminSponsorshipsView.tsx` | `GET /api/v1/admin/sponsorship-campaigns`, `POST .../:id/approve \| reject \| pause` |

**Sponsor create form.** The fields are exactly `CreateSponsorshipCampaignSchema`:
name, sponsor category, objective, reward type, reward amount (whole
units), charge per rewarded completion, total and daily budget, per-developer
daily and lifetime reward caps, display frequency cap, eligible client types
(none selected = all), start and end date, plus one optional inline offer
(`SponsoredOfferInputSchema`: title, description, link, required action,
expiry). The sponsor category is optional in the UI as well as the schema:
it is labelled "(optional)", never `required`, and a blank value is omitted
from the request. Every optional field left blank is omitted rather than
sent as 0 or "". Currency is always USD (the schema default; the form has no
currency picker). Money is typed in dollars and parsed to integer cents from
its digits (no `parseFloat`), and all money and units are displayed from
integer digits. Campaigns are saved as DRAFT and submitted from the list or
detail page.

**Sponsor list and detail.** Every status (DRAFT, SUBMITTED, APPROVED,
REJECTED, PAUSED, ARCHIVED) is shown, with the rejection reason. A draft can
be submitted once it has an active offer (the button is disabled with an
explanation otherwise, matching the server's
`campaign_needs_at_least_one_offer`). Offers can be added while the campaign
is a draft. Performance shows the stats the list route returns (displays,
completions, rewards granted, spend) and an integer reconciliation: rewards
granted x charge per completion vs. actual spend, with the difference
explained as completions rewarded after the budget ran out (the server's
soft cap still rewards the developer but skips the charge), and total
budget remaining. When a campaign has several active offers, the page says
that only the oldest active, unexpired offer is served at a time
(`loadSponsorshipCandidates`).

**Admin review.** A separate "Sponsorships" page with its own queue
(SUBMITTED, oldest submission first) next to, not merged into, the Ad
Campaign queue. Each queued campaign shows the advertiser id, category (or
"not specified"), objective, reward, sponsor charge, budgets, caps, client
types, dates and every offer (title, description, link, required action,
expiry). Approve, reject (reason required, 1-500 characters, as the server
validates) and pause (APPROVED only, with a confirm that there is no resume)
use the existing admin routes. All other campaigns are listed with status
and rejection reason.

Every view handles loading, expired session (sign-in link), request /
network / malformed-response errors (message plus retry) and empty states.
Tests: `apps/advertiser-dashboard/__tests__` and
`apps/admin-dashboard/__tests__`, vitest with views rendered by
`react-dom/server` (no DOM library), configured exactly like `apps/web`.

What sponsors and admins can do today vs. what is gapped:

| Capability | Status |
| --- | --- |
| Sponsor: create a campaign (with an optional first offer) | Available |
| Sponsor: add offers to a draft | Available |
| Sponsor: submit DRAFT -> SUBMITTED | Available |
| Sponsor: list campaigns with status and whole-campaign stats | Available |
| Sponsor: edit a draft campaign | Route exists (`PATCH /api/v1/sponsorship-campaigns/:id`); no UI yet |
| Sponsor: edit, deactivate or remove an offer | **Gap.** No route; offers can only be added, and only in DRAFT |
| Sponsor: withdraw, archive, pause or resume a campaign | **Gap.** No sponsor route; ARCHIVED has no writer at all |
| Sponsor: fetch one campaign | **Gap (worked around read-only).** No `GET /sponsorship-campaigns/:id`; the detail page reads the list and picks the campaign |
| Sponsor: per-day spend, daily budget usage, per-offer stats, time series | **Gap.** Stats are whole-campaign totals only |
| Admin: SUBMITTED queue, approve, reject, pause | Available |
| Admin: resume a paused campaign, archive | **Gap.** No route |
| Admin: advertiser name on a sponsorship campaign | ~~**Gap.** The admin DTO has only `advertiserId`~~ Available: `advertiserName` on the admin list (see below) |
| Admin: campaign stats (displays, completions, spend) | ~~**Gap.** Only the sponsor list route computes `stats`; the admin list doesn't~~ Available: same `stats` on the admin list |
| Admin: inspect `SponsorshipEvent` rows (displays, skips, opens, completions per developer/offer) | ~~**Gap.** No admin read route~~ Available: `GET /api/v1/admin/sponsorship-campaigns/:id/events` |
| Admin: inspect `DeveloperRewardLedger` rows (rewards granted per developer/campaign) | ~~**Gap.** No admin read route~~ Available: `GET /api/v1/admin/sponsorship-campaigns/:id/rewards` |

Known gaps (not patched in this phase):

- **No admin read route for sponsorship activity.** Fraud and abuse review
  needs a read-only, `requireAdmin` endpoint over `SponsorshipEvent` and
  `DeveloperRewardLedger`, for example
  `GET /api/v1/admin/sponsorship-campaigns/:id/events` and
  `GET /api/v1/admin/sponsorship-campaigns/:id/rewards` (or a single
  filterable `GET /api/v1/admin/sponsorship-activity?campaignId=&developerId=`),
  paginated, returning coarse fields only (type, offer, developer id,
  session id, timestamps, reward amount and status; no event metadata
  beyond what the server already stores). It would be a pure read like the
  offer listing: no writes, no cap or spend changes. The admin page states
  that this isn't available instead of showing anything partial.
  *Resolved by the admin sponsorship activity routes below.*
- **Admin campaign stats and advertiser name.** Adding the sponsor list's
  `stats` block and the advertiser's name to the admin list response (read
  only) would let reviewers see spend and who the sponsor is.
  *Resolved: the admin list now carries both, additively (see below).*
- **Sponsor lifecycle.** Offer edit/deactivate, sponsor-side
  withdraw/archive/pause and admin resume/archive are all mutations and need
  routes before any UI can offer them.
- **Reporting.** No per-day or per-offer breakdown and no daily budget
  usage is exposed, so the dashboards only show campaign totals.

## Admin sponsorship activity (read-only)

Closes the Phase 5 admin gaps. Three read-only, `requireAdmin` routes let a
DevAds admin see who sponsors a campaign, how it is performing and, for
fraud and abuse review, exactly which developers displayed, completed and
were rewarded for it. No write route, Prisma model or migration was added:
every table read here has existed since Phase 1.

| Route | Returns | File |
| --- | --- | --- |
| `GET /api/v1/admin/sponsorship-campaigns?status=` | the existing campaign DTOs, each with `advertiserName` and `stats` added | `routes/sponsorshipCampaigns.ts` |
| `GET /api/v1/admin/sponsorship-campaigns/:id/events?limit=&cursor=&developerId=&type=` | `{ items: [{ eventId, type, offerId, developerId, sessionId, displayEventId, createdAt }], nextCursor }` | `routes/sponsorshipAdminActivity.ts` |
| `GET /api/v1/admin/sponsorship-campaigns/:id/rewards?limit=&cursor=&developerId=` | `{ items: [{ id, developerId, rewardType, campaignId, sponsorshipEventId, entryType, amountUnits, status, createdAt }], nextCursor }` | `routes/sponsorshipAdminActivity.ts` |

**Enriched list, additive only.** Every field the admin list returned before
is still there with the same value; `advertiserName` (joined from
`Advertiser.name`) and `stats { displays, completions, rewardsGranted,
spendCents }` are added. The stats come from
`lib/sponsorshipCampaignStats.ts`, which holds the exact four queries the
sponsor list route has used since Phase 1, moved out unchanged so both
routes share one implementation. The sponsor route's response is unchanged
(it does not gain `advertiserName`). Shared schema:
`AdminSponsorshipCampaignDTOSchema`, which is `SponsorshipCampaignDTOSchema`
extended with the two fields, so the old schema still parses the new
response.

**Activity rows.** Events and ledger rows are scoped by their `campaignId`
column, the same column the stats count, so one campaign's view never shows
another campaign's rows. Events carry the correlation needed to spot replay
and abuse: each completion's `displayEventId` is the server-recorded
`OFFER_DISPLAYED` it claims, and an EARNED ledger row's `sponsorshipEventId`
is the display it paid for. Optional `developerId` (both routes) and `type`
(events) filters narrow a page to, say, one developer's completions. The
DTOs are explicit selects: event `metadata` and the ledger `description`
are never read or returned, and developers appear only by the id the admin
UI already uses; no profile, user, email or session detail beyond the
session id. Shared schemas: `AdminSponsorshipEventDTOSchema`,
`AdminRewardLedgerEntryDTOSchema` (the wallet's `RewardLedgerEntryDTOSchema`
plus `developerId` and `sponsorshipEventId`) and their page schemas.

**Pagination scheme.** No admin route had pagination before, so this is the
first: keyset (cursor) paging, newest first, ordered by `(createdAt desc,
id desc)`. `limit` defaults to 50 and is capped at 200
(`AdminActivityPageQuerySchema`). A response's `nextCursor` is an opaque
string naming the last row of the page (null on the last page); pass it
back as `cursor` for the next page. Unlike offset paging, pages stay stable
while new events keep arriving, and rows sharing a timestamp are still
ordered by id so none is skipped or repeated. A malformed cursor is a 400
`invalid_cursor`; an unknown campaign is a 404 `campaign_not_found`;
anything but an admin session is a 403, like every other admin route.

**Admin UI.** The admin Sponsorships page shows the advertiser name next to
the id and the stats on every campaign, and each campaign has an
**Activity** button that opens two read-only tables in place of the old
"not available" note: sponsorship events (time to the second in UTC, event
type, developer, session, event id, the display it refers to, offer) and
the developer reward ledger (time, developer, entry type, amount, status,
the display it paid for), each with Newer/Older paging, 50 rows a page.

Tests: `services/ad-server/src/__tests__/sponsorshipAdminActivity.integration.test.ts`
(real Postgres: 403 for developer, advertiser and anonymous callers,
paging at several page sizes with timestamp ties, per-campaign scoping,
filters, no metadata/description in responses, enriched stats equal to
the sponsor route's, additive-contract checks against the old schema, a
read-only snapshot check, and an end-to-end display/completion/reward
trace), plus shared schema and `apps/admin-dashboard` tests.

Not done here:

- **The admin list is still unpaginated** and computes stats with four
  queries per campaign, the same as the sponsor list. Fine at current
  volumes; a batched `groupBy` and list paging are the next step if the
  number of campaigns grows.
- **Ledger index.** `developer_reward_ledger` has no index leading with
  `campaignId` (its indexes lead with `developerId`), so the rewards route
  filters on campaign without an ideal index. Adding one needs a migration,
  which this change deliberately doesn't include.
- **No cross-campaign view.** There is no `GET /api/v1/admin/sponsorship-activity`
  across all campaigns or per developer; review is per campaign.
- **No automated fraud detection.** These routes let a person inspect
  activity; `services/fraud` is still a stub, and there is no reversal route,
  so an admin who finds abuse can pause the campaign but cannot reverse a
  reward.

## Adapter runtime and integration boundary (Phase 6)

Full guide: [adapters.md](./adapters.md). Summary:

- **Adapter runtime in the SDK.** `packages/ad-sdk/src/adapter/` holds the
  part of every client that does not depend on the tool:
  `DevelopmentSessionManager` (one shared in-flight start, failure
  tolerance, stale-session invalidation) and `SponsoredOfferRuntime`
  (request during a wait, present only while it is active, one offer at a
  time, skip / interact / open / complete against `displayEventId`, the
  open-only completion policy, retry vs. final refusal, never throwing).
  Both were extracted from the VS Code extension's Phase 3 modules with the
  same behavior. The runtime imports nothing outside the SDK.
- **Host contract.** A client implements `AdapterHost` (`presentOffer`,
  `dismissOffer`, `openExternal`, optional `notify` and `log`) and passes a
  `WaitHandle` (`isActive()`) for each natural wait it already observes.
  That is the entire tool-specific surface.
- **VS Code is now a host.** `sponsorshipSession.ts` re-exports the SDK's
  session manager, and `SponsoredOfferController` keeps only the extension's
  own policy (the terminal-wait eligibility gate, once per command run, no
  offer alongside a standard ad) and delegates the lifecycle to the
  runtime. Its public module API is unchanged and its existing tests pass
  without modification. The standard ad flow is untouched.
- **Integration registry.** `CLIENT_INTEGRATIONS` records, per
  `DevClientType`, whether DevAds ships an adapter. Only `VS_CODE` is
  `IMPLEMENTED`; a test enforces that and that the implementation path is a
  real SDK consumer in this repository.
- **No core changes.** No schema, migration, route, targeting, accounting
  or DTO change was needed. A new end-to-end test drives the full loop
  through a hypothetical `OTHER` client written only against the public SDK
  (sponsored by a conference, rewarding a non-AI reward type), and a static
  test keeps named client types and AI vendor names out of the server,
  targeting and shared sources.

Not done here, deliberately:

- **No adapter for any other tool.** Each needs a documented, permitted
  extension surface that is separate from the model's context; the checklist
  per target is in [adapters.md](./adapters.md#what-a-legitimate-integration-for-each-target-would-need).
- **No machine credential** for headless agents. Device auth works for
  interactive CLIs; a non-interactive credential belongs with the fraud work.
- **No verified outcome events** (SDK init, deploy, registration). They need
  a server-side attestation source, not client heuristics, and the objective
  enum already leaves room for them.
- **Cursor attribution.** If the VS Code extension runs in Cursor (untested),
  it reports `VS_CODE`.

## Reward redemption (Phase 7)

Full design: [redemption.md](./redemption.md). Summary:

- Developers redeem wallet units from the Rewards page or through
  `DevAdsClient.redeemReward()`. The server recomputes the balance from the
  ledger under the developer's wallet lock, writes a `RewardRedemption` and a
  `REDEEMED` ledger debit in one transaction, calls the configured provider,
  and on failure appends a compensating `ADJUSTMENT` credit. Idempotency key,
  lock, conditional decrement and DB constraints make double debits,
  overdrafts and double refunds impossible.
- `REDEMPTION_PROVIDER` selects `manual` (operators fulfil and settle from
  the admin dashboard's Redemptions page) or `mock` (dev only). Unset
  disables redemption; there is no fallback.
- Schema: new `reward_redemptions` table; the ledger gains a nullable
  `redemptionId` and its `campaignId` becomes nullable (redemption rows have
  no campaign), with CHECK constraints keeping `EARNED` rows campaign-bound
  and `REDEEMED` rows redemption-bound. The existing campaign foreign key is
  unchanged.
- No vendor (AI, cloud, API) redemption exists; each would be a new provider
  behind the same interface once an official mechanism and agreement exist.

## Qualifying interaction kinds

DevAds is not built around "AI wait time". The core model is:

**development session -> sponsorship opportunity -> DevAds presentation
surface -> verified developer engagement -> reward**

A wait (a terminal command still running, an agent turn in progress) is one
kind of *qualifying interaction* inside a development session: a moment the
client can already observe that gives it an opportunity to present an
offer. Until this change the adapter boundary only knew about waits
(`WaitHandle { isActive() }`), so every later feature (video creatives, a
"how long can we show this" question, new trigger types) would have been
coupled to "a wait is active". The interaction kind makes the trigger a
named, recorded dimension instead.

| Kind | Meaning | Status |
| --- | --- | --- |
| `WAIT` | The developer is waiting on something the client observes. | **The only kind with real behavior.** The VS Code terminal-wait flow sends it explicitly. Also the server default. |
| `DEVELOPER_INITIATED` | The developer explicitly asked to see an opportunity; not gated on a wait. | Placeholder. Accepted and recorded; no client sends it yet. |
| `OTHER` | Extensible catch-all for future kinds (build complete, tool discovery, project creation, ...). | Placeholder. None of those are implemented. |

Where it lives:

- **Schema.** Enum `QualifyingInteractionKind` and a nullable
  `SponsorshipEvent.interactionKind` column (migration
  `20261005221513_qualifying_interaction_kind`, additive only). It is
  recorded per event, not on `DevelopmentSession`: one session contains many
  interactions of different kinds, while `DevelopmentSession.activityCategory`
  stays the coarse, session-wide label it always was. Rows written before
  the migration keep `NULL` ("recorded before kinds existed"); they are
  deliberately not backfilled, because the web beta's developer-initiated
  requests and VS Code's terminal waits can't be told apart after the fact.
- **Wire.** `GET /api/v1/sponsorships/offer` takes an optional
  `interactionKind` (`SponsoredOfferRequestSchema`, default `WAIT`, unknown
  values are a 400). The server writes it on the `OFFER_DISPLAYED` event.
  `POST /api/v1/sponsorships/events` has no such field: every skip, open,
  interact or completion copies the kind from the display it references,
  so a client can never relabel a display after the fact.
- **SDK.** `requestSponsoredOpportunity({ interactionKind })` sends the kind
  only when the caller gives one. The adapter runtime takes a
  `QualifyingInteraction { kind, isActive() }` via
  `SponsoredOfferRuntime.offerDuring()` and ends it with
  `interactionEnded()`. The Phase 6 names still work: `WaitHandle`
  (`{ isActive }`, optionally `kind: "WAIT"`) is accepted by
  `offerDuringWait()`, which is exactly `offerDuring({ kind: "WAIT", ... })`,
  and `waitEnded()` is `interactionEnded()`.
- **VS Code.** `SponsoredOfferController` builds the terminal wait with
  `terminalWait(tracker)`, a `QualifyingInteraction` of kind `WAIT`. Triggers,
  timing, policy and UI are unchanged; the only observable difference is
  `interactionKind=WAIT` on the offer request.

The kind is descriptive. It changes no eligibility, selection, frequency cap,
budget, reward or completion rule, and carries nothing about the developer's
work. New capabilities that depend on the interaction (for example how many
seconds a presentation could take, for time-bounded creatives) are meant to
be added as optional members of `QualifyingInteraction`, answerable by any
kind, rather than as wait-specific APIs.

Not done here, deliberately:

- **No new interaction kinds have behavior.** Build-complete, tool-discovery
  and project-creation triggers are future work. The video-creative work is
  to be rebased onto this abstraction first.
- **The web beta originally sent no kind,** so its developer-initiated
  requests were recorded as `WAIT` by the server default. That one-line
  follow-up has since landed: `apps/web/lib/betaOffer.ts` now sends
  `interactionKind: "DEVELOPER_INITIATED"`.
- **No read path exposes the kind yet** (admin activity DTOs, sponsor stats).

## Presentation modes, creatives and available seconds

This section ports the first-party beta video work (originally built on the
unmerged `feat/beta-video-ads` branch, which coupled it to waits) onto the
qualifying-interaction model above. Product and creative details are in
[beta-video-ads.md](./beta-video-ads.md).

### Model

- **`PresentationMode`** (`CARD` | `VIDEO`) on `SponsoredOffer`
  (`presentationMode`, default `CARD`). Every offer that existed before is
  `CARD`, which is exactly how every client presented it.
- **`CreativeKind`** (`VIDEO`; new kinds extend the enum without changing the
  offer shape) and **`OfferCreative`**: one row per creative length of an
  offer (`@@unique([offerId, durationSeconds])`), with a preferred source
  (`url`/`mimeType`, WebM/VP9 for video), an optional fallback source
  (`fallbackUrl`/`fallbackMimeType`, H.264 MP4), `posterUrl`, `width`,
  `height` and the asset's `sha256`. Database CHECK constraints keep every
  row a real, bounded asset: duration 1 to 600 s, positive dimensions,
  http(s) URLs only, `video/mp4` or `video/webm` for video, and a fallback
  that is a complete pair.
- **`SponsorshipEvent.creativeId`** (nullable, `ON DELETE SET NULL`): the
  creative served with an `OFFER_DISPLAYED` event, for auditing. `NULL` for
  CARD offers and for every row recorded before the migration. It sits next
  to `interactionKind`; the two are independent (a display records which
  interaction it was requested during and, separately, which creative was
  served).

Migration: `20261005233000_offer_creatives` (additive only: two enums, one
defaulted column, one nullable column, one table, constraints). The
branch's own two migrations were not replayed; their content is merged into
this one on top of the current history.

### `availableSeconds()`: an optional capability, not a wait API

A VIDEO creative must fit the time the developer actually has. On the
branch that was `WaitHandle.availableSeconds()` and a wire field named
`availableWaitSeconds`, so video could only ever exist for waits. Here it is
an **optional member of `QualifyingInteraction`**:

```ts
interface QualifyingInteraction {
  readonly kind: QualifyingInteractionKind;
  isActive(): boolean;
  availableSeconds?(): number | undefined; // optional capability
}
```

A capability belongs to what an interaction can actually know, not to its
kind:

| Interaction | `availableSeconds()` | Result |
| --- | --- | --- |
| VS Code terminal `WAIT` with duration history | present: estimated seconds left in the command | CARD or VIDEO |
| VS Code terminal `WAIT`, unknown command / video off / compact mode | absent | CARD only |
| Web beta `DEVELOPER_INITIATED` (a click has no time window) | absent | CARD only |
| Legacy `WaitHandle` via `offerDuringWait()` | absent (not added to the legacy shape) | CARD only |
| Any future kind that can estimate a window (`OTHER`, ...) | may be present | CARD or VIDEO |

How it flows:

1. **SDK runtime.** `offerDuring(interaction)` reads
   `interaction.availableSeconds?.()`. A missing method, `undefined`, a
   non-finite value or a throwing estimator all mean "no estimate"; a number
   is floored and clamped to 0 to 3600. Only when there is a number is it
   sent, as `availableSeconds` on `GET /api/v1/sponsorships/offer`
   (`OpportunityContext.availableSeconds`). Nothing else about the
   interaction is sent.
2. **Server (authoritative).** `SponsoredOfferRequestSchema.availableSeconds`
   (optional integer 0 to 3600; malformed values are a 400). In
   `isDeveloperEligibleForSponsorship`, a VIDEO offer is eligible only when
   `selectCreativeForWindow(creatives, availableSeconds)` finds a creative:
   the longest one that fits, never a longer one, and nothing under 10 s
   (`MIN_VIDEO_WINDOW_SECONDS`) or with no value. With the 10/15/20 s cuts:
   under 10 s or unknown -> no video (a CARD offer may still win), 10 to 14 s
   -> 10 s, 15 to 19 s -> 15 s, 20 s or more -> 20 s. Ties at equal sponsor
   charge prefer a (fitting) VIDEO offer, then the offer shown least to this
   developer today, then load order; a higher charge always wins. The route
   picks the same creative deterministically, records `creativeId` (plus the
   reported seconds and the creative length in the display's metadata) and
   returns `presentationMode` and `creative` in the offer. The client never
   chooses the presentation mode, the creative or the reward. The interaction
   kind is not consulted: video depends only on whether a window was
   reported, so the kind stays descriptive.
3. **Client re-check (non-authoritative).** Before presenting, the runtime
   calls `fitsWindow(offer, interaction.availableSeconds?.())`: a VIDEO offer
   whose creative no longer fits (time passed during the request), or that
   arrives for an interaction with no available seconds at all, is not
   presented. CARD offers always fit. This is also why a
   `DEVELOPER_INITIATED` interaction can never start a video, even against a
   misbehaving server.

The read-only listing (`GET /api/v1/sponsorships/offers`) ignores the fit
rule: a listing is not a display, so no interaction or window is involved.

An offer's `ctaUrl` may contain `{displayEventId}`, which the server
replaces with the display's id (`resolveCtaUrl`) so a landing page can act
on exactly that display. Offers without the token are returned unchanged.

### VS Code: the terminal wait's estimator

`apps/vscode-extension/src/waitEstimator.ts` is wait-specific by nature and
stays so: it keys each command by a SHA-256 hash of the normalized command
line in the extension's local `workspaceState` (at most 200 commands, 5
samples each, never the text), and estimates the time left as the shortest
recent run minus the time already elapsed (it errs short). It is not a
separate code path: `terminalWait(tracker, availableSeconds)` (in
`sponsoredOffer.ts`) exposes it as the `WAIT` interaction's
`availableSeconds()` capability, and only when the panel can actually play
video (`presentation = "panel"`, `video.enabled`, a known command). Durations
are learned only under the same conditions.

### Presentation surfaces: the DevAds panel first, the status bar as fallback

The branch opened a webview only for VIDEO offers, next to the status bar
item. Here the panel is the general DevAds-owned surface for any
presentation mode, and the status bar is the compact mode and the fallback
(the original spec's section 13):

- **`devads.sponsorship.presentation`** = `"panel"` (default) or
  `"statusBar"`. `devads.sponsorship.video.enabled` (default on) only
  matters in panel mode.
- **`OfferPresentationController`** (`offerPresentation.ts`, pure, no VS Code
  API) implements the existing `SponsoredOfferView`, so the SDK lifecycle in
  `SponsoredOfferController` is untouched whichever surface is used. In panel
  mode it shows the offer in the panel and hides the status bar item (one
  surface at a time). It falls back to the status bar when the panel cannot
  be created (webviews unavailable), when it cannot render the offer, or when
  the developer closes the panel while the offer is still live (closing is
  not a skip; only the Skip button reports one). In `statusBar` mode it never
  creates a panel and behaves exactly like the status bar item alone; the
  extension also reports no available seconds then, so the request is the
  CARD-only one it always was.
- **`WebviewOfferPanel`** (`offerPanel.ts`) opens beside the editor with
  `preserveFocus`, loads no local resources, and accepts only `open`, `skip`
  and `mediaError` messages, acting only on the offer it currently renders.
  When the offer goes away (wait ended, skipped, opened) it closes, unless it
  is the tab the developer is looking at: then it shows an empty state instead
  of disappearing under them.
- **`offerPanelView.ts`** renders every state with one security posture
  (the branch's video view, generalized): CSP `default-src 'none'`,
  nonce-only inline style/script, media and images only from the creative's
  own origins (a CARD page allows no media at all), every server string
  escaped, the CTA URL never in the page. CARD = attribution label, headline,
  body, reward line, Open/Skip. VIDEO = the same plus a muted, autoplaying
  player (WebM first, MP4 fallback, poster), a "Loading video..." state until
  the first frame, and an inline error state that keeps the offer usable if
  no source plays. A VIDEO offer whose creative is not playable (non-https
  media, for example) renders as CARD rather than failing.
- **Labels.** Every surface uses the same attribution: "DevAds Beta ·
  First-party" plus "Created and funded by DevAds. Not an external sponsor."
  for `campaignMode = BETA`, "Sponsored" for everything else. The status bar
  item, its tooltip and its detail notification now apply this too (they
  previously said "Sponsored" for DevAds' own beta offer); output for LIVE
  sponsor offers is unchanged.

### Not done here

- **Sponsor self-service video upload.** Creatives are added by the seed or
  an operator; the sponsor dashboard cannot attach `OfferCreative` rows yet,
  and sponsor-created offers are always CARD.
- **No other client reports available seconds.** Only the VS Code terminal
  wait does. Agent adapters could add it to their own interactions without
  any runtime or server change.
- **No read path exposes `creativeId`** (admin activity DTOs, sponsor stats),
  same as `interactionKind`.
- **The 25 s README demo** (`docs/demo/`, `tools/beta-creatives/render-demo.mjs`)
  was not ported as a README change; its render tool is in
  `tools/beta-creatives/` but the rendered demo files are not.
