# Reward redemption (Phase 7)

Developers earn reward units (AI credits, API credits, discounts, and other
reward types) by completing sponsored offers. Redemption turns those units
into something they can actually use. This document covers the accounting
model, the providers, the API and what is deliberately not built.

## What exists

| Piece | Where |
| --- | --- |
| `RewardRedemption` model, ledger link, CHECK constraints | `packages/database/prisma/schema.prisma`, migration `20260929160000_reward_redemptions` |
| Providers and factory | `packages/shared/src/providers.ts` (`ManualRedemptionProvider`, `MockRedemptionProvider`, `createRedemptionProvider`) |
| Developer and admin routes | `services/ad-server/src/routes/redemptions.ts` |
| Balance rules (shared by wallet and redemption) | `services/ad-server/src/lib/rewardBalance.ts` |
| Protocol SDK | `DevAdsClient.redeemReward()` and `listRedemptions()` in `@devads/ad-sdk` |
| Developer UI | Redeem form and redemption history on the Rewards page (`apps/web`) |
| Operator UI | Redemptions page in the admin dashboard (`apps/admin-dashboard`) |

## Providers: what is real

| `REDEMPTION_PROVIDER` | Behavior | Use |
| --- | --- | --- |
| unset (default) | Redemption disabled. `POST` returns `503 redemption_disabled`; the wallet says redemption isn't available. | Any deployment without a fulfilment process. |
| `manual` | Every redemption is accepted as `PENDING` with its units reserved. A DevAds operator delivers the value out of band (for example a credit code a sponsor supplied) and marks it delivered, or fails it, which returns the units. | **The production path today.** Needs no third-party integration. |
| `mock` | Completes every redemption immediately and delivers nothing. | Development and demos only. Never in production. |

Unlike payouts and billing, there is no silent fallback: an unset or
unrecognised value disables redemption, so a deployment can never debit
developer units through a provider nobody chose.

**No AI-provider or vendor redemption is implemented.** Delivering credits
directly into a vendor's product (an AI platform, a cloud provider, an API
provider) needs that vendor's official, documented credit-issuing mechanism
and, in practice, a commercial agreement. None exists. When one does, it is a
new `RedemptionProvider` implementation (`supportsRewardType` + `redeem`)
selected by configuration, and nothing in the ledger, routes, SDK or UI
changes. Local models need no redemption provider at all: their cost is not
metered by a vendor.

## Accounting model

The reward ledger stays the source of truth and is append-only in amount.

```
Request (under the developer's wallet lock, one transaction)
  ├─ replay check on (developerId, idempotencyKey)
  ├─ balance recomputed from the ledger for that reward type
  ├─ RewardRedemption            status PENDING, provider = configured kind
  ├─ ledger REDEEMED  -amount    status PENDING, redemptionId, no campaign
  └─ wallet cache     -amount    conditional decrement (CHECK >= 0 backs it)

Provider call (outside the transaction)

Settle (under the same lock; status change is a conditional update)
  ├─ COMPLETED   redemption COMPLETED, REDEEMED debit -> APPROVED (final)
  ├─ FAILED      redemption FAILED, REDEEMED debit -> REJECTED,
  │              ledger ADJUSTMENT +amount APPROVED, wallet cache +amount
  └─ PENDING /   status and reference recorded; units stay reserved
     PROCESSING
```

Balance rules (`lib/rewardBalance.ts`, used by both the wallet read and the
redemption check): approved `EARNED` and `ADJUSTMENT` credit; `REDEEMED`,
`REVERSED` and `EXPIRED` debit whatever their status; pending `EARNED` is
pending. So a failed redemption nets to zero through two visible rows
instead of an edited one, and a reserved (pending) redemption is already
unavailable.

What each quantity is:

| Quantity | Meaning |
| --- | --- |
| Available units (ledger) | Developer liability not yet redeemed or reserved |
| Open redemptions (`PENDING` / `PROCESSING`) | Units reserved and owed to the developer as delivered value |
| Completed redemptions | Liability discharged |
| Sponsor charges (`sponsorship_campaign_spend`) | Unchanged by redemption; a sponsor is charged when the reward is earned |

Redemption never touches campaign spend, the ad earnings ledger or payouts.

### Integrity guarantees

| Threat | Guard |
| --- | --- |
| Double submit / retry | `@@unique([developerId, idempotencyKey])`; a replay returns the original with `idempotent: true`. The same key with a different amount or type is `409 idempotency_key_reused`. |
| Concurrent redemptions overdrawing | Per-developer advisory lock (`reward-wallet:<id>`, shared with the wallet read) around the balance check and debit; conditional cache decrement; DB `CHECK (availableUnits >= 0)`. A concurrent *earn* only adds units, so it cannot cause an overdraw. |
| Double debit or double refund | `@@unique([redemptionId, entryType])` on the ledger. |
| Racing complete and fail | Status transition is `UPDATE ... WHERE status IN (PENDING, PROCESSING)` under the lock; exactly one wins, the other gets `409 redemption_not_open`. |
| Client choosing the outcome | The request schema has only `developerId`, `rewardType`, `amountUnits`, `idempotencyKey`; provider, status and references are server-set, and unknown keys are stripped. |
| Another developer's wallet | Ownership check (`developer.userId === session.sub`), same as the wallet and earnings routes. |
| Abuse volume | Per-route rate limit of 20 requests a minute, below the global 300. |
| Provider crash | A throwing provider is treated as `FAILED` (`provider_error`) and the units are returned; its error message is never returned or stored. |
| Orphaned rows | CHECK: `EARNED` requires a campaign, `REDEEMED` requires a redemption; `amountUnits > 0` on redemptions. |

## API

All routes are on the ad server. Shapes are the shared DTOs in
`packages/shared/src/sponsorship.ts`.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/v1/wallet/redemptions` | developer session, owner | Body `{ developerId, rewardType, amountUnits, idempotencyKey }`. `201 { redemption, idempotent: false }`, or `200 { ..., idempotent: true }` on replay. Refusals: `400 insufficient_balance` (with `availableUnits`), `400 reward_type_not_redeemable`, `409 idempotency_key_reused`, `409 wallet_reconciliation_required`, `503 redemption_disabled`, `429`. |
| `GET /api/v1/wallet/redemptions?developerId=` | developer session, owner | `{ redemptionEnabled, redeemableRewardTypes, redemptions }` (latest 50). |
| `GET /api/v1/admin/redemptions?status=` | admin | Queue, oldest first, up to 200. |
| `POST /api/v1/admin/redemptions/:id/complete` | admin | Optional `{ providerRef }` (an internal fulfilment reference, never the reward code). |
| `POST /api/v1/admin/redemptions/:id/fail` | admin | `{ reason }`; returns the units. |

The admin routes work even when no provider is configured, so open
redemptions can still be closed out after redemption is turned off.

**Contract change.** `RewardLedgerEntryDTO.campaignId` is now nullable and
gained an optional `redemptionId`. SDK and web builds from before this change
reject a wallet that contains a redemption row as unreadable; both ship from
this repository and were updated together.

## Observability

`services/ad-server/src/lib/domainEvents.ts` emits `reward.redemption.requested`,
`.completed`, `.failed` and `.rejected` with only identifiers, reward type,
units, provider, actor (`provider` / `admin`) and a reason code. It is off
by default; `DOMAIN_EVENT_LOG=stdout` writes JSON lines. A test asserts the
field allowlist.

## Privacy

A redemption carries the developer id, reward type and units. Providers
receive the same plus the redemption id. No source code, prompts, activity
data or contact details are involved. Operators should not paste the
delivered reward itself (for example a credit code) into the fulfilment
reference, because the developer's API and the admin list both return it.

## Not built (deliberately)

- **Vendor redemption providers** (AI platforms, cloud, API providers): need
  official credit-issuing mechanisms and agreements; see above.
- **Cash conversion through the payout provider**: would mix the reward
  ledger with the cash earnings ledger and needs its own accounting design.
- **Delivering codes through DevAds**: the manual flow delivers out of band.
  Storing and revealing codes needs encrypted storage and a reveal audit.
- **Polling asynchronous providers**: `RedemptionProvider` has no status
  query. `PROCESSING` redemptions are settled by an operator today.
- **Reward reversal for fraud** (`REVERSED` entries) and expiry: still
  deferred with the fraud work.
- **VS Code extension redemption UI**: the SDK supports it; the extension
  still only shows the wallet.
