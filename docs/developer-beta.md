# DevAds Developer Beta

DevAds is usable today as a public developer beta. A new developer can go to
https://devads-app.vercel.app, choose **Join the Developer Beta**, sign in
with GitHub or Google, join the beta, opt in to sponsorships, complete a real
DevAds beta opportunity and see the verified reward in their wallet.

DevAds has **no external sponsors** yet. The beta exists so developers can use
the real sponsorship infrastructure before any sponsor does, not to simulate
sponsor demand.

## What the beta is, and is not

| | |
| --- | --- |
| **Beta campaigns** | Campaigns with `mode = BETA`. They are owned and funded by DevAds (advertiser "DevAds"), labelled **DevAds Beta Opportunity** everywhere they appear, and served only to developers who joined the beta. |
| **Live campaigns** | Every sponsor campaign is `mode = LIVE` (the default). Sponsors cannot create or switch to a beta campaign: `mode` is not part of the sponsor API. |
| **Beta Credits** | The reward type `BETA_CREDITS`. A record of verified participation. Not cash, no monetary value, never redeemable (the redemption API refuses them even when a provider is configured), and never granted by a sponsor campaign (schema refinement plus a database CHECK). |
| **Not included** | No fake sponsors, advertisers, testimonials or metrics. No reward for watching third-party content such as YouTube, and no use of anyone else's ad inventory. No special integrations with AI providers. No email/password or magic-link sign-up for the beta, and no email delivery. |

## The developer journey

```
/  --Join the Developer Beta-->  /join  --GitHub or Google-->  /auth/callback
   -->  /app/onboarding (accept beta terms, opt in)  -->  /app (dashboard)
   -->  Find a beta opportunity  -->  /beta/opportunity (walkthrough)
   -->  Confirm completion (verified on the server)  -->  /app/wallet
```

| Route | Purpose |
| --- | --- |
| `/join` | Explains the beta and offers **Continue with GitHub** / **Continue with Google**. |
| `/login` | The same OAuth buttons; email/password remains available, collapsed, for existing password accounts (such as the local demo accounts). Honours a same-site `?next=`. |
| `/signup` | Redirects to `/join`. |
| `/auth/callback` | Completes PKCE with Supabase, exchanges the Supabase access token for a DevAds session, then discards the Supabase session. Shows a clear message for each refusal (for example, an email that already belongs to a password account). |
| `/app` | Dashboard: beta status, opt-in toggle, wallet balances, the current beta opportunity, recent rewards, interactions, sessions and VS Code extension status. |
| `/app/onboarding` | Beta terms (versioned), the acceptance checkbox, and an explicit sponsorship opt-in (unticked for new accounts). |
| `/app/wallet` | The reward wallet, with beta-funded entries labelled "DevAds beta". |
| `/app/sessions` | Development sessions and sponsorship history. |
| `/beta/opportunity` | The DevAds-owned walkthrough that is the beta campaign's qualifying action. |
| `/beta/terms` | The public beta terms. |

Every `/app/*` route redirects to `/login?next=<route>` without a session and
to onboarding until the developer has joined the beta. These redirects are
presentation only: every API call is authorized on the server.

## How it works

### One identity

Supabase Auth runs the GitHub/Google OAuth redirect and nothing else. The
browser posts the Supabase access token once to
`POST /api/v1/auth/oauth/exchange`. The ad-server does not trust the token
itself: it asks Supabase who it belongs to (`GET /auth/v1/user`, publishable
key only, no Supabase secret held), which also rejects expired, revoked and
forged tokens. It then:

- maps the Supabase user id to `User.authSubject = "supabase:<uuid>"`, the
  stable identity (unique index);
- creates a `DEVELOPER` user and developer profile on first sign-in, with
  sponsorships **off**;
- never links accounts by email: if the email already belongs to a different
  DevAds account the exchange returns 409 `email_in_use_by_another_account`;
- refuses non-OAuth Supabase methods (email, phone, anonymous);
- returns an ordinary DevAds session token, the same kind the password login
  and the VS Code device flow issue.

There is therefore one identity system. The VS Code extension links to the
same account through the existing device-pairing flow: run **DevAds: Sign In**
in VS Code and approve the code on `/device` while signed in on the web. The
approval binds the device to the signed-in session's user.

### Beta membership and opt-in

- `POST /api/v1/me/beta` records `betaJoinedAt` and the accepted
  `betaTermsVersion` (currently `2026-09-30`). It is idempotent and keeps the
  original join time.
- The opt-in is the existing `PATCH /api/v1/developers/:id/preferences
  { adsEnabled }`. Opting out stops all new offers immediately.
- Offer eligibility (`packages/targeting`) excludes BETA campaigns for
  developers who have not joined the beta, in addition to every existing rule
  (opt-in, client type, categories, caps, budget, schedule).

### The seeded beta campaign

`packages/database/seed/beta.ts` creates, idempotently (upsert, never
overwriting an existing row):

| Field | Value |
| --- | --- |
| Advertiser | DevAds (`devads-beta`) |
| Campaign | DevAds Developer Beta (`devads-developer-beta`), `mode BETA`, `APPROVED` |
| Reward | 50 `BETA_CREDITS` per verified completion |
| Caps | 1 per developer per day, 3 per developer lifetime, 5 displays per day |
| Budget | internal accounting only (`totalBudgetCents 100000`, `sponsorChargeCents 1`); no money moves |
| Clients | `WEB`, `VS_CODE` |
| Qualifying action | open the walkthrough at `<site>/beta/opportunity`, stay at least 15 seconds, then confirm |

Run it against any database with:

```
npm run seed:beta -w @devads/database
```

The walkthrough URL uses the first non-empty of `BETA_SITE_URL` or
`NEXT_PUBLIC_SITE_URL`, falling back to `https://devads-app.vercel.app`.

### First-party video campaigns

Alongside the walkthrough, the seed creates four DevAds-owned VIDEO
campaigns (Schema-Watch, web-harvester, The Scribe, DevAds) with real 10,
15 and 20 second creatives, served in the VS Code extension only when a cut
fits the expected wait. The reward still requires the DevAds-controlled
qualifying action on the product page, never the video itself. See
[beta-video-ads.md](./beta-video-ads.md).

### Verification and the ledger

The web app is a first-party protocol client (`WEB`) and uses
`@devads/ad-sdk` exactly like any other adapter:

1. `requestSponsoredOpportunity` makes the server select an offer and record
   a server-issued `OFFER_DISPLAYED` event.
2. The walkthrough reports `OFFER_OPENED` for that display.
3. `completeQualifyingAction` sends `OFFER_COMPLETED`. The server requires
   an `OFFER_OPENED` for this display and developer at least
   `minEngagementSeconds` earlier, measured from its own event rows
   (409 `offer_not_opened` / `engagement_too_short`). The browser's
   countdown is only a convenience.
4. The completion runs in the existing row-locked transaction: campaign and
   offer still live, caps and budget re-checked, one ledger row per event
   (unique `sponsorshipEventId`, idempotent on `eventId`), so replays and
   concurrent submissions pay exactly once.

Beta ledger rows carry `rewardSource = DEVADS_BETA` and
`campaignMode = BETA`; sponsor rows carry `SPONSOR` / `LIVE`. Database CHECK
constraints enforce that beta campaigns grant only Beta Credits, that earned
Beta Credits are always labelled as beta, and that `DEVADS_BETA` implies Beta
Credits. There is no route that writes a wallet or ledger row from a client:
reward values in a request are ignored. The beta ledger is separate from the
legacy ad-earnings ledger (`DeveloperEarningsLedger`) and from payouts.

## Setup (operator)

These steps are one-time and are done in the Supabase, GitHub, Google and
Vercel dashboards. None of them depend on owning a custom domain.

### 1. OAuth apps

The OAuth callback always goes to Supabase, not to the site:
`https://<project-ref>.supabase.co/auth/v1/callback`
(for this project: `https://gsurxzrvcetdpynggajl.supabase.co/auth/v1/callback`).

- **GitHub**: Settings, Developer settings, OAuth Apps, New OAuth App.
  Homepage URL `https://devads-app.vercel.app`, Authorization callback URL as
  above. Copy the client ID and generate a client secret.
- **Google**: Google Cloud Console, APIs & Services, Credentials, Create
  OAuth client ID (Web application). Authorized JavaScript origin
  `https://devads-app.vercel.app`, authorized redirect URI as above. Configure
  the consent screen with only the default `email`, `profile` and `openid`
  scopes.

### 2. Supabase Auth

In the Supabase dashboard, Authentication:

- **Sign In / Providers**: enable GitHub and Google with the client IDs and
  secrets from step 1. Leave email, phone and anonymous sign-in disabled; the
  ad-server refuses them regardless.
- **URL Configuration**: Site URL `https://devads-app.vercel.app`. Redirect
  URLs: `https://devads-app.vercel.app/auth/callback` and, for local
  development, `http://localhost:3000/auth/callback`.

### 3. Environment variables

| Project | Variable | Value |
| --- | --- | --- |
| `devads` (web) | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `devads` (web) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |
| `devads` (web) | `NEXT_PUBLIC_AD_SERVER_URL` | the API origin |
| `devads-api` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | same as above |
| `devads-api` | `CORS_ALLOWED_ORIGINS` | include `https://devads-app.vercel.app` |
| `devads-api` | `TRUST_PROXY` | `true` (per-client rate limits behind Vercel) |
| `devads-api` | `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET` | secrets; set by the operator |

The web project builds with `apps/web/vercel.json`
(`turbo run build --filter=@devads/web`) so the workspace packages it imports
(`@devads/ad-sdk`, `@devads/shared`) are compiled first.

The API build runs the migrations and then `npm run seed:beta -w
@devads/database`, which is safe to repeat.

### 4. Adding a custom domain later

Add the domain to the `devads` Vercel project, set `NEXT_PUBLIC_SITE_URL` to
it, add `https://<domain>/auth/callback` to the Supabase redirect URLs and the
origin to `CORS_ALLOWED_ORIGINS`, and update the GitHub/Google homepage and
JavaScript-origin fields. The OAuth callback URL (Supabase's) does not change,
and nothing in the code names a domain.

## Local development

OAuth needs a real Supabase project. Without the Supabase variables, `/join`
and `/login` say sign-in is not configured, and the whole beta loop can still
be exercised with the demo password account (`dev@devads.dev` /
`dev12345`) via `/login`: the demo seed also seeds the beta campaign with a
`http://localhost:3000` walkthrough link.

## Tests

`services/ad-server/src/__tests__/betaLifecycle.integration.test.ts` covers
the lifecycle against a real database: OAuth account creation and retrieval,
invalid and forged tokens, no email linking, concurrent first sign-in, the
auth rate limit, the full sign-in to wallet loop, non-members never receiving
beta offers, replay and concurrency (exactly one reward), budget exhaustion,
opt-out, ignored client-supplied reward values, Beta Credits never
redeemable, unauthenticated and cross-developer access, sponsors unable to
create Beta Credit campaigns, and the database CHECK constraints.
`identity.test.ts` covers token verification, and `apps/web/__tests__/beta.test.tsx`
covers redirect safety, offer labelling, error messages, the terms and the
landing CTAs.
