# DevAds

**Turn developer wait time into value.**

DevAds is a developer advertising network. Its first client is a VS Code
extension that shows a small, tasteful sponsored card during naturally
occurring wait time -- builds, installs, tests -- and never a moment longer.
If your build finishes before the minimum wait threshold, you never see an
ad. Developers opt in, get paid a share of ad revenue, and can turn it off
in one click.

## Why

Developers already spend real time waiting on their tools. That wait time
is either wasted or interrupted by unrelated notifications -- DevAds
monetizes it instead, on the developer's terms, with revenue shared back to
them.

## How it works

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

Strict allowlist telemetry only: detected language/runtime/platform and the
*name* of the command (e.g. `npm`, never full arguments). Never source
code, file contents, environment variables, or secrets. Full detail:
[docs/privacy.md](./docs/privacy.md).

## Repository layout

```
apps/
  web/                    Landing page + developer dashboard (Next.js)
  advertiser-dashboard/   Campaign creation & management (Next.js)
  admin-dashboard/        Approval queue, platform analytics (Next.js)
  vscode-extension/       The VS Code extension itself

packages/
  database/    Prisma schema, migrations, seed data
  shared/      Money utilities, Zod DTOs, Payout/Billing provider abstraction
  auth/        Sessions, magic links, device-auth codes, password hashing
  targeting/   Pure ad eligibility/targeting/frequency-cap/budget engine

services/
  ad-server/   Fastify API -- the one place all money/eligibility logic lives

docs/          architecture, privacy, advertiser guide, developer guide, OpenAPI spec
scripts/       demo.js (one-command setup), demo-wait.js (simulated slow command)
```

## Running locally

Requires Node 20+, Docker Desktop.

```bash
npm install
npm run demo          # brings up Postgres + MinIO, migrates, seeds demo data
```

Then, in separate terminals:

```bash
DATABASE_URL="postgresql://devads:devads@localhost:5442/devads?schema=public" \
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

## VS Code extension

```bash
npm run package -w @devads/vscode-extension    # produces devads-0.1.0.vsix
```

Install via **Extensions → ... → Install from VSIX**, or press F5 in
`apps/vscode-extension` (with that folder open) for an Extension
Development Host. Run **DevAds: Sign In**, then trigger a card with:

```bash
node scripts/demo-wait.js 30
```

Full walkthrough: [docs/developer-guide.md](./docs/developer-guide.md).

## Tests

```bash
npm test          # unit + integration tests across every workspace (turbo)
```

Integration tests run against a real Postgres (the `docker compose up
postgres` instance) and cover the full campaign → approval → ad selection →
qualified view → earnings ledger → payout lifecycle, plus idempotency,
frequency capping, and the auth/ownership guards. Unit tests cover the
pure targeting engine, money math, and the extension's eligibility logic
(no VS Code host required).

## Revenue model

CPM-based. Advertiser spend splits between platform and developer by a
configurable basis-points share (`DEFAULT_DEVELOPER_REVENUE_SHARE_BPS`,
default 60% to developers). All money is stored as integer minor units plus
a currency code -- never floating point. See
[docs/architecture.md](./docs/architecture.md#money).

## Security

- Client is never authoritative for money, impressions, or eligibility --
  the ad-server re-derives everything server-side.
- Event reporting is idempotent (unique `event_id`); a retried/duplicated
  request can't double-pay.
- Session-token + resource-ownership checks guard developer and earnings
  endpoints; admin endpoints require an ADMIN-role session. One known
  remaining gap (advertiser/campaign routes) is documented in
  [docs/api.md](./docs/api.md).
- Money columns carry CHECK constraints at the database level in addition
  to application-level integer-cents handling.

## Roadmap

Phase 1 (this MVP): VS Code extension, ad server, three dashboards, demo
mode. Phase 2+: CLI, JetBrains, browser extension, real S3/Stripe
deployment, creative upload UI, automated fraud anomaly detection. Full
detail and rationale for what's *not* built yet:
[docs/architecture.md](./docs/architecture.md#roadmap).

## License

MIT (see [apps/vscode-extension/LICENSE](./apps/vscode-extension/LICENSE)).
