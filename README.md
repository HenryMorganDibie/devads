# DevAds

**Turn developer wait time into value.**

DevAds is a developer advertising network:

- **Developers** install a VS Code extension, opt in, and earn a revenue
  share from small, tasteful sponsored cards shown only during wait time
  they were already spending -- builds, installs, tests. If your command
  finishes before the minimum wait threshold, you never see an ad, and you
  can turn it off in one click.
- **Advertisers** create a campaign, target it by language/framework/
  runtime/platform/country, and reach developers inside the tool they're
  already using -- not a webpage, not a pre-roll video.
- **The platform** takes a configurable cut of advertiser spend and pays
  the rest to the developer whose wait time earned it, tracked in a
  transparent, auditable ledger.

VS Code is the first client. The backend is client-agnostic by design --
see [docs/architecture.md](./docs/architecture.md) for how a CLI,
JetBrains plugin, or browser extension would plug into the same ad-server
later.

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
frequency capping, concurrent-request safety (payouts, budget enforcement,
carry accounting -- each proven with real simultaneous HTTP requests, not
just serial calls), and the auth/ownership guards. Unit tests cover the
pure targeting engine, money math, object-storage upload validation, and
the extension's eligibility logic (no VS Code host required). 89 tests
total, all green from a fresh clone.

## Revenue model

CPM-based. Advertiser spend splits between platform and developer by a
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

Phase 1 (this MVP): VS Code extension, ad server, three dashboards, real
creative upload to object storage, demo mode. Phase 2+: CLI, JetBrains,
browser extension, real Stripe deployment, video creative rendering,
automated fraud anomaly detection. Full detail and rationale for what's
*not* built yet: [docs/architecture.md](./docs/architecture.md#roadmap).

## License

MIT (see [apps/vscode-extension/LICENSE](./apps/vscode-extension/LICENSE)).
