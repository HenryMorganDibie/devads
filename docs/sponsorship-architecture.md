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
  local agents). None exist, not even as stubs. Adapters would authenticate
  the same way the VS Code extension does today (session bearer token via
  device auth). No API-key or machine-auth mechanism exists. That is a known
  gap for non-interactive agents.
- **Dashboard UI** for sponsorship campaigns, the admin queue and the
  developer wallet. The endpoints exist. The Next.js apps don't call them yet.
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

**Status of clients.** Nothing consumes the SDK yet. Phase 3 will move the
VS Code extension onto it. Later, a Phase 6 adapter for another tool (Claude
Code, Codex, Gemini, Cursor, OpenCode, Aider, or a custom or local agent)
would build against this same client. None of those adapters exist, not even
as stubs, and no AI-provider integration exists. The only trace of those
tools is the shared `DevClientType` enum value each would send.

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
and local agents are not built, not even as stubs.

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
- **Ledger window.** The wallet returns the 50 most recent ledger rows with
  no pagination. History shows only that window, and the monthly totals
  are marked as possibly incomplete when all 50 rows fall in the current
  month.
- **No sponsor or campaign names** in ledger entries (only `campaignId`),
  so history rows can't say which sponsorship a reward came from.
- **No separate sponsorship opt-in.** The page reflects `adsEnabled`, which
  also controls standard ads.
