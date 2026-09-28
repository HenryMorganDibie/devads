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
