# DevAds

**The sponsorship infrastructure for AI-powered development.**

**Website: [devads-app.vercel.app](https://devads-app.vercel.app)** · **Now in developer beta:** [join with GitHub or Google](https://devads-app.vercel.app/join)

[![The DevAds website hero: "Build with AI. Get sponsored." beside a diagram of sponsor funding flowing through DevAds to a developer's reward](docs/screenshots/01-hero.jpg)](https://devads-app.vercel.app)

DevAds lets organizations sponsor developers. Developers opt in and receive
useful rewards while they build, and DevAds provides the infrastructure that
verifies and manages the exchange:

```
sponsor campaign -> developer engagement -> verified outcome -> developer reward -> wallet
```

- **Sponsors** (any legitimate organization, not only developer-tool or AI
  companies) fund campaigns with a budget, an objective and a reward. They are
  charged per verified completion at the price they set, never beyond budget,
  instead of paying for anonymous impressions.
- **Developers** opt in, choose what to engage with, and receive rewards in a
  wallet backed by a reward ledger. AI credits are the first concrete use
  case; the ledger also supports API, compute and tool credits, subscription
  credits, discounts, cash and other reward types. DevAds never needs source
  code, prompts, model responses or secrets.
- **Platforms** (IDEs, AI coding agents, CLIs, developer tools) integrate
  through the DevAds protocol, `@devads/ad-sdk`. They own the experience and
  the session; DevAds owns campaigns, eligibility, verification, charges,
  rewards and wallets.
- **DevAds** earns a platform fee: each campaign configures the sponsor's
  charge and the developer's reward independently, and the fee is the
  difference.

### The first use case: sponsorship during waits in VS Code

The first client built on this infrastructure is the VS Code extension. While
a build, install or test the developer is already waiting on is still
running, never before and never longer, it can present a reward-carrying
sponsored offer in the DevAds panel, a DevAds-owned tab beside the editor:
as a card, or as a short muted video when one fits the time left. The
status bar is its compact mode and fallback, and it also carries standard
CPM sponsored cards. A wait is the first qualifying interaction DevAds
supports, not its definition.

```
$ npm run build
  building...

                                          ┌──────────────────────────────┐
                                          │ SPONSORED                    │
                                          │ Ship faster with Acme Cloud  │
                                          │ Zero-config deploys for Node │
                                          │ [ Learn more ]               │
                                          └──────────────────────────────┘
  build complete ✓
```

*(Static mockup of a standard status-bar card. Sponsored offers open in the
DevAds panel instead; see [docs/developer-guide.md](./docs/developer-guide.md).)*

## Status

| | What |
| --- | --- |
| **Developer beta** | Public and usable: GitHub or Google sign-in, beta onboarding, a developer dashboard, and DevAds-funded first-party beta campaigns (a walkthrough card plus four product video campaigns) whose Beta Credits are verified on the server and recorded in the wallet. There are no external sponsors yet ([docs/developer-beta.md](./docs/developer-beta.md)) |
| **Implemented** | Sponsorship campaigns with sponsor and admin review; server-side offer selection, targeting, budgets, caps and verification; idempotent sponsor charges in integer cents; reward ledger and developer wallet; `@devads/ad-sdk` protocol SDK and adapter runtime; sponsor, admin and developer dashboards; the VS Code extension and the DevAds web app (the two clients), including wait-time sponsored cards with CPM campaigns, developer earnings and payouts |
| **Early** | Reward redemption, fulfilled by an operator ([docs/redemption.md](./docs/redemption.md)); Stripe billing and payouts, intended for test-mode keys and only used when configured; the hosted API (live at `devads-api.vercel.app`; no public API keys for third parties yet) |
| **Planned** | Adapters for AI coding agents, CLIs and other IDEs ([docs/adapters.md](./docs/adapters.md) lists what each would legitimately require); automated fraud detection and reward reversals; automatic delivery of more reward types |
| **Partnerships** | **None.** DevAds has no partnership with Anthropic, OpenAI, Google, Cursor or any other AI or developer-tool company, and none is needed: the whole loop runs on infrastructure DevAds controls. Client types such as `CLAUDE_CODE` or `CURSOR` are labels a sponsor may target, not integrations. |

## Developer beta

DevAds runs a public developer beta while it has no external sponsors. A
developer signs in with GitHub or Google on
[/join](https://devads-app.vercel.app/join), accepts the beta terms, opts in,
and completes a **DevAds Beta Opportunity**: a campaign owned and funded by
DevAds, whose qualifying action (a walkthrough of how sponsored developer
experiences work) is verified on the server. The reward is **Beta Credits**,
recorded in the same idempotent reward ledger with `rewardSource =
DEVADS_BETA` and `campaignMode = BETA`. Beta Credits are not cash, cannot be
redeemed and are never granted by sponsor campaigns.

Sign-in uses Supabase Auth for the OAuth redirect only; the ad-server
verifies the token with Supabase and issues its own DevAds session, so there
is one identity for the web app and the VS Code extension (linked through the
existing device pairing). Setup, the security model and the operator steps
(OAuth apps, Supabase redirect URLs, environment variables) are in
[docs/developer-beta.md](./docs/developer-beta.md).

## Try the sponsorship loop

With the demo stack from [Running locally](#running-locally) and the
ad-server running, one command drives the whole loop through the same
`@devads/ad-sdk` boundary any client uses, with no AI-provider account (it
reports the `VS_CODE` client type, which the seeded demo campaigns target):

```bash
npm run demo:sponsorship
```

```
01  A sponsor funds campaigns
    Acme Cloud Quickstart (DEMO): $25,000.00 budget, pays $3.00 per verified completion, rewards 500 COMPUTE_CREDITS units
02  A developer opts in and starts a session from a client
03  DevAds selects an eligible sponsored opportunity
04  The developer chooses to engage
05  The client reports the qualifying action; DevAds verifies it server-side
06  The sponsor is charged according to the campaign
    Acme Cloud Quickstart (DEMO): spend $0.00 -> $3.00
07  The developer receives the reward
    500 COMPUTE_CREDITS units, status APPROVED
08  The reward appears in the developer's wallet
    COMPUTE_CREDITS: 500 available (ledger total 500)
09  DevAds earns its platform fee

Safety check: replaying the same completion
    idempotent=true; wallet and sponsor spend unchanged: true
```

*(Abridged output from a real run. All sponsors, offers and amounts are
fictional seed data.)* Duplicate and replayed events, campaign and budget
exhaustion, concurrent rewards, forged displays, unauthorized access and
cross-developer access are each covered by integration tests against a real
Postgres; see [Tests](#tests).

## The website

[devads-app.vercel.app](https://devads-app.vercel.app) tells the DevAds
story from top to bottom. The diagrams use three colors consistently:
**amber** for sponsor funding, **mint** for developer value and **blue**
for verified engagement. Every product preview on the site is labelled
*Conceptual preview* or *Illustrative example*; none of the figures are
real customers or results. Screenshots are of the production build at
1440px wide unless noted.

### Try it: a sponsored opportunity, step by step

The hero includes a fictional opportunity card. Pressing it plays through
what DevAds does between the sponsor and the developer.

| 1. The developer sees an offer | 2. DevAds verifies the engagement | 3. The reward lands in the wallet |
| :---: | :---: | :---: |
| ![Opportunity card offering $20 developer credits with a View opportunity button](docs/screenshots/step-1-opportunity.jpg) | ![The same card showing Verifying engagement](docs/screenshots/step-2-verifying.jpg) | ![The same card showing Added to wallet](docs/screenshots/step-3-rewarded.jpg) |

In the sponsor section, choosing an objective updates the campaign preview
(here, *Event registration* turns the outcome metric into *Registrations*):

![Sponsor dashboard preview with Event registration selected](docs/screenshots/step-4-objective.jpg)

### Page by page

**1. The shift.** AI changed how developers build, and what building
costs.

![The problem section: a modern developer's recurring stack of AI agents, model APIs, cloud and tools](docs/screenshots/02-problem.jpg)

**2. A new model.** Don't just advertise to developers; sponsor them.

![Traditional advertising compared with DevAds sponsorship](docs/screenshots/03-new-model.jpg)

**3. The economic loop.** Nine steps from a funded campaign to the platform
fee, each tagged with who acts: the sponsor, the developer or DevAds. The loop advances on its own and each step can be selected.

![The nine-step economic loop with a key of who does what](docs/screenshots/04-economic-loop.jpg)

**4. For developers.** Get sponsored value while you build: opt in, choose
what to engage with, keep your work private. With a conceptual wallet.

![Developer rewards and the conceptual DevAds wallet](docs/screenshots/05-developers.jpg)

**5. Developer privacy.** What stays in the developer's session, and the
coarse, allowlisted metadata a sponsorship event carries.

![Privacy boundary between the developer's session and a sponsorship event](docs/screenshots/06-privacy.jpg)

**6. For sponsors.** A conceptual campaign dashboard, sponsor objectives,
and the categories of organizations that can sponsor.

![Sponsor dashboard preview, objectives and sponsor categories](docs/screenshots/07-sponsors.jpg)

**7. For platforms.** Add sponsored developer experiences through the DevAds
protocol.

![Potential integrations converging on the DevAds Protocol](docs/screenshots/08-platforms.jpg)

**8. The protocol.** Real `@devads/ad-sdk` calls, and the stack from
clients to sponsors. VS Code is the only client connected today; the others
are potential client types, not integrations or partnerships.

![Protocol section with SDK code and the client-to-sponsor stack](docs/screenshots/09-protocol.jpg)

**9. Why DevAds.** Four principles: developer controlled, sponsor funded,
outcome focused, platform ready.

![The four principles](docs/screenshots/10-principles.jpg)

**10. From impression to value.** Each line lights up as it scrolls into
view.

![Impressions are easy to buy; developer value is even more powerful](docs/screenshots/11-crescendo.jpg)

**11. Imagine this.** An illustrative campaign from funding to platform
fee.

![Illustrative six-step example of a cloud company's sponsorship](docs/screenshots/12-example.jpg)

**12. Infrastructure.** What sits under the simple experience the developer
sees.

![Infrastructure layers from sponsors to accounting](docs/screenshots/13-infrastructure.jpg)

**13. Status.** What is implemented, what is early and what is planned.
Partnerships: none.

![Where DevAds is today: implemented, early and planned](docs/screenshots/14-status.jpg)

**14. Business model.** Developers get rewards, sponsors get qualified
engagement, DevAds gets platform fees.

![Everyone gets something: the business model](docs/screenshots/15-business-model.jpg)

**15. FAQ.**

![Frequently asked questions](docs/screenshots/16-faq.jpg)

**16. Get started.** One path each for developers, sponsors and platforms.

![Final call to action with three paths](docs/screenshots/17-cta.jpg)

![Site footer](docs/screenshots/18-footer.jpg)

### On mobile

The layout is designed for phones rather than shrunk from desktop
(captured at 390px).

<p>
  <img src="docs/screenshots/mobile-hero.jpg" alt="Mobile hero" width="300">
  &nbsp;
  <img src="docs/screenshots/mobile-developers.jpg" alt="Mobile developer section" width="300">
</p>

## How it works

### The sponsorship loop

1. A sponsor funds a campaign: budget, objective, reward and price per
   verified completion. An admin reviews it before it serves.
2. A developer opts into sponsorship in a client (today, the VS Code
   extension).
3. DevAds selects an eligible sponsored opportunity server-side and records
   a server-issued display.
4. The developer chooses to engage, or skips at no cost.
5. The client reports the qualifying action; DevAds verifies it against the
   server-issued display, the campaign's liveness and the developer's caps,
   inside a row-locked transaction.
6. The sponsor is charged the campaign's price, never beyond its budget.
7. The developer receives the campaign-configured reward.
8. The reward appears in the developer's wallet, backed by a reward ledger
   that is separate from the ad earnings ledger.
9. DevAds earns its platform fee.

Full design: [docs/sponsorship-architecture.md](./docs/sponsorship-architecture.md).

### Wait-time sponsored cards (the first use case)

```
command starts (npm install, cargo build, docker build, ...)
        v
still running after devads.minimumWaitSeconds? -> ask the ad server
        v
server re-validates: opted in? eligible campaign? frequency cap OK? budget OK?
        v
still running when the response comes back? -> show a compact status-bar card
        v
command ends / dismissed -> card disappears immediately, view reported
```

See [docs/architecture.md](./docs/architecture.md) for the full data flow
and design rationale.

## Privacy

No source code. No prompts. No model responses. No secrets. DevAds never
reads files, inspects other processes, intercepts prompts, captures model
output, extracts credentials or relies on undocumented provider APIs. The
VS Code client learns that a terminal command started and ended through
VS Code's public shell-integration events. It sends at most the command's
first word (for example `npm`), and keeps a local-only history of how long
commands took, stored as hashes, to estimate whether a video fits. Sponsorship
requests carry only coarse, allowlisted metadata about the interaction
(client type, version, server-issued ids, interaction kind and, for video,
the estimated seconds left), and the SDK's public types have no field for
anything else.

For wait-time cards, strict allowlist telemetry only: detected language/runtime/platform and the
*name* of the command (e.g. `npm`, never full arguments). Never source
code, file contents, environment variables, or secrets. Full detail:
[docs/privacy.md](./docs/privacy.md).

## Repository layout

```
apps/
  web/                    Public site (devads-app.vercel.app) + developer dashboard (Next.js)
  advertiser-dashboard/   Campaign creation & management (Next.js)
  admin-dashboard/        Approval queue, platform analytics (Next.js)
  vscode-extension/       The VS Code extension itself

packages/
  database/    Prisma schema, migrations, seed data
  shared/      Money utilities, Zod DTOs, Payout/Billing provider abstraction
  auth/        Sessions, magic links, device-auth codes, password hashing
  targeting/   Pure ad eligibility/targeting/frequency-cap/budget engine
  ad-sdk/      DevAds Protocol SDK and client adapter runtime

services/
  ad-server/   Fastify API -- the one place all money/eligibility logic lives

docs/          architecture, sponsorship architecture, client adapters, redemption, privacy, advertiser guide, developer guide, OpenAPI spec
scripts/       demo.js (one-command setup), demo-wait.js (simulated slow command)
```

## Running locally

Requires Node 20+, Docker Desktop.

```bash
git clone https://github.com/HenryMorganDibie/devads.git
cd devads
cp .env.example .env      # ad-server loads this automatically
npm install                # also generates the Prisma client (postinstall)
npm run demo                # brings up Postgres + MinIO, migrates, seeds,
                             # and builds the packages the ad-server needs
```

`npm run demo` is idempotent -- safe to re-run against an already-running
stack. This whole sequence (including the two commands below) is tested
from a genuinely fresh `git clone` before every push, not just assumed to
still work.

Then, in separate terminals:

```bash
npm run dev -w @devads/ad-server
NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/web
NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/advertiser-dashboard
NEXT_PUBLIC_AD_SERVER_URL=http://localhost:4000 npm run dev -w @devads/admin-dashboard
```

Seeded logins:

| Role | Email | Password |
|---|---|---|
| Admin | admin@devads.dev | admin12345 |
| Developer | dev@devads.dev | dev12345 |
| Advertiser | advertiser@devads.dev | advertiser12345 |

## Deployment

The public site is `apps/web`, deployed on Vercel as the `devads` project
and served at **https://devads-app.vercel.app**. Pushes to `main` deploy to
production; other branches get preview deployments.

- `NEXT_PUBLIC_SITE_URL=https://devads-app.vercel.app` is set in the
  project's production environment. It drives the canonical URL and Open
  Graph metadata, and `apps/web/middleware.ts` uses it to 308-redirect any
  other `*.vercel.app` production address (such as the auto-assigned
  `devads-seven.vercel.app`) to the canonical one.
- `NEXT_PUBLIC_AD_SERVER_URL` points the site at the ad-server. The
  ad-server (`services/ad-server`) is set up as the `devads-api` Vercel
  project; it is not live until its database and secret environment
  variables are configured, so sign-up and sign-in on the public site do
  not work yet.
- Developer beta sign-in additionally needs `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on the web project,
  `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` on the API, and GitHub and
  Google enabled in Supabase Auth with
  `https://devads-app.vercel.app/auth/callback` as an allowed redirect. See
  [docs/developer-beta.md](./docs/developer-beta.md#setup-operator).
- The web project builds through `apps/web/vercel.json` (turbo), so the
  workspace packages it imports are compiled first.

## VS Code extension

```bash
npm run package -w devads    # produces apps/vscode-extension/devads-0.1.0.vsix
```

Install via **Extensions → ... → Install from VSIX**, or press F5 in
`apps/vscode-extension` (with that folder open) for an Extension
Development Host. The extension talks to the production API
(`https://devads-api.vercel.app`) by default; against a local stack set
`devads.adServerUrl` to `http://localhost:4000` and `devads.webAppUrl` to
`http://localhost:3000`. Run **DevAds: Sign In**, then trigger a card with:

```bash
node scripts/demo-wait.js 30
```

Full walkthrough: [docs/developer-guide.md](./docs/developer-guide.md).

## Tests

```bash
npm test          # unit + integration tests across every workspace (turbo)
```

Integration tests run against a real Postgres (the `docker compose up
postgres` instance). They cover:

- **Sponsorships:** campaign -> offer -> verified completion -> sponsor
  charge -> reward -> wallet, including a third-party-style adapter driving
  the loop through `@devads/ad-sdk`; duplicate and replayed events; forged
  displays; paused, expired and exhausted campaigns; daily and total
  budgets; developer caps; concurrent completions; unauthenticated,
  forged-token and cross-developer access; and redemption with its
  reconciliation.
- **Ads:** campaign -> approval -> ad selection -> qualified view ->
  earnings ledger -> payout, with idempotency, frequency capping and
  concurrent-request safety for budgets, carry accounting and payouts.

Unit tests cover the pure targeting engine, money math, the SDK and adapter
runtime, upload validation and the extension's eligibility logic (no VS Code
host required).

The integration tests read `DATABASE_URL` from the environment. Without a
reachable database they **skip rather than fail**, so run them with the
variable set (for example `set -a && . ./.env && set +a && npm test`) and
check the run takes seconds, not milliseconds.

## Revenue model

**Sponsorships:** each campaign sets the sponsor's charge per verified
completion (integer cents) and the developer's reward (integer reward
units) independently. DevAds keeps the difference as its platform fee. No
fixed conversion between reward units and cents is assumed.

**Wait-time cards:** CPM-based. Advertiser spend splits between platform and developer by a
configurable basis-points share (`DEFAULT_DEVELOPER_REVENUE_SHARE_BPS`,
default 60% to developers). All money is stored as integer minor units plus
a currency code -- never floating point, and never lost to per-impression
rounding (see [docs/architecture.md](./docs/architecture.md#money)).

## Security

- Client is never authoritative for money, impressions, identity, or
  eligibility -- the ad-server re-derives everything server-side from the
  caller's verified session, never from an id in the request body.
- Event reporting is idempotent (unique `event_id`); a retried/duplicated
  request can't double-pay.
- Session-token + resource-ownership checks guard every developer,
  earnings, campaign, and advertiser route; admin endpoints require an
  ADMIN-role session.
- Campaign spend and developer earnings are computed inside
  Postgres-row-locked transactions and payouts inside an advisory-locked
  one, so concurrent requests can't double-spend a budget or double-pay a
  balance -- each guarantee has a dedicated test that fires real
  concurrent HTTP requests and checks the totals.
- Creative uploads are validated server-side by MIME type and size, never
  trusted from the client.
- Rate limited (300 req/min default, 10/min on auth endpoints).
- CORS is locked to an explicit origin allowlist (not reflect-any-origin).
- Money columns carry CHECK constraints at the database level in addition
  to application-level integer-cents handling.

## Roadmap

The sponsorship domain (development sessions, sponsored offers, sponsor
charges, reward ledger and wallet) is provider-agnostic and sits alongside
the original ad system without changing it; reward accounting never touches
the ad earnings ledger or payouts. See
[docs/sponsorship-architecture.md](./docs/sponsorship-architecture.md).

Next, in rough order:

- **Client adapters** beyond VS Code: AI coding agents, CLIs and other
  IDEs, built on the adapter runtime in `@devads/ad-sdk`. None exists yet;
  [docs/adapters.md](./docs/adapters.md) sets out what each would
  legitimately require. None needs a vendor partnership.
- **Abuse controls:** automated fraud detection, completion proof and
  reward reversals (today: server-issued displays, idempotency, row locks,
  per-developer caps and ownership checks).
- **Rewards:** automatic delivery for more reward types (today: redemption
  is operator-fulfilled; see [docs/redemption.md](./docs/redemption.md)).
- **Payments:** live Stripe billing and payouts.
- **Standard CPM cards:** CLI, JetBrains and browser clients, and video for
  CPM creatives (sponsorship offers already play video in the DevAds panel).
  Detail: [docs/architecture.md](./docs/architecture.md#roadmap).

## License

MIT (see [apps/vscode-extension/LICENSE](./apps/vscode-extension/LICENSE)).
