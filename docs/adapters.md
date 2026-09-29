# Client adapters (Phase 6)

DevAds is a sponsorship platform with a protocol boundary. Developer tools
(editors, CLIs, AI coding agents, local agents) are **clients** of that
protocol. The core (campaigns, targeting, eligibility, offer selection,
budgets, caps, event validation, sponsor charges, reward accounting, fraud
controls, privacy) does not know which client it is talking to, beyond the
coarse `DevClientType` label a sponsor may use to restrict eligibility.

This document covers the adapter architecture, what an adapter must and
must not do, and, for each future target, what a legitimate integration
would require. **The VS Code extension is the only implemented client.**
Everything else below is an integration target, not a supported
integration.

## Current status

| Client type | Status | Where |
| --- | --- | --- |
| `VS_CODE` | **Implemented** | `apps/vscode-extension` |
| `CLAUDE_CODE` | Not implemented | none |
| `CODEX` | Not implemented | none |
| `GEMINI` | Not implemented | none |
| `CURSOR` | Not implemented | none |
| `OPENCODE` | Not implemented | none |
| `AIDER` | Not implemented | none |
| `CUSTOM_AGENT` | Not implemented | none |
| `LOCAL_AGENT` | Not implemented | none |
| `OTHER` | Not implemented | none |
| `WEB` | **Implemented** | `apps/web` (the developer beta's first-party web client) |

The table mirrors `CLIENT_INTEGRATIONS` in
`packages/ad-sdk/src/adapter/integrations.ts`, which is the test-enforced
source of truth: a test fails if any type other than `VS_CODE` and `WEB` is marked
implemented, or if an implemented entry does not point at a package in this
repository that depends on the SDK.

**No partnership exists with any AI or tooling vendor, and none is needed
for DevAds to work.** The sponsor, engagement, reward and wallet loop runs
entirely on infrastructure DevAds controls, and it is proven end to end by
a test that drives it through a hypothetical client (see
[Proof](#proof-that-the-boundary-holds)). An official integration or
partnership with a vendor is an optional future distribution opportunity,
not a dependency.

## Layers

```
 Sponsor ──funds──▶ DevAds core (services/ad-server, packages/targeting,
                     packages/database, packages/shared)
                          ▲
                          │  DevAds Protocol: HTTP + shared DTOs
                          │
                     @devads/ad-sdk
                      ├─ DevAdsClient            (wire contract, validation, typed errors)
                      └─ adapter runtime         (host-agnostic lifecycle)
                           ├─ DevelopmentSessionManager
                           └─ SponsoredOfferRuntime
                          ▲
                          │  AdapterHost + WaitHandle
                          │
               ┌──────────┴──────────┐
          VS Code host          future hosts (not built)
     (apps/vscode-extension)
```

1. **Core.** Owns every economic and eligibility decision. Never branches on
   a client type (enforced by `services/ad-server/src/__tests__/providerIndependence.test.ts`).
2. **Protocol / SDK.** `DevAdsClient` wraps the HTTP API with the shared
   DTO schemas (see [sponsorship-architecture.md](./sponsorship-architecture.md#protocol-sdk-phase-2)).
3. **Adapter runtime** (new in Phase 6, `packages/ad-sdk/src/adapter/`). The
   part of every client that is the same regardless of tool: session
   lifecycle, the offer lifecycle, event correlation, the completion policy
   and failure handling. It imports nothing outside the SDK (no Node, VS
   Code or DOM API), so any JavaScript host can use it.
4. **Host.** The only tool-specific code: how to render an offer, how to
   open a link, and which natural waits the tool can already observe.

## The adapter contract

A new client implements `AdapterHost` and supplies `WaitHandle`s:

```ts
import { DevAdsClient, DevelopmentSessionManager, SponsoredOfferRuntime, type AdapterHost } from "@devads/ad-sdk";

const client = new DevAdsClient({
  baseUrl,
  credentials: { token: () => readStoredSessionToken(), developerId: () => readDeveloperId() },
  clientType: "CUSTOM_AGENT",   // the tool's own DevClientType value
  clientVersion: toolVersion,
});

const host: AdapterHost = {
  presentOffer: (offer) => renderSponsoredPanel(offer),  // labelled "Sponsored"
  dismissOffer: () => hideSponsoredPanel(),
  openExternal: (url) => openInBrowser(url),             // true only if it opened
  notify: (msg) => showToast(msg),
  log: (msg) => debugLog(msg),
};

const session = new DevelopmentSessionManager(() => client);
const offers = new SponsoredOfferRuntime({ getClient: () => client, session, host });

// Lifetime
await session.start();              // tool started / user signed in
await session.end();                // tool exits / user signs out or opts out

// A natural wait the tool already observes (a long build, an agent turn)
await offers.offerDuringWait({ isActive: () => waitStillRunning });
offers.waitEnded();                 // wait finished: offer disappears, no skip reported

// Explicit developer actions only
await offers.skip();
await offers.interact();
await offers.open();                // OFFER_OPENED, then completion if opening is the whole action
```

| The host decides | The runtime handles | The server decides |
| --- | --- | --- |
| Where and how the offer is drawn | Starting and reusing one session; recovering from a stale one | Whether an offer is served at all (opt-in, eligibility, targeting) |
| Which waits are worth an offer (minimum duration, once per wait, not alongside other promotional UI) | Presenting only while the wait is still active | Which offer, and its reward and charge |
| Opening the link | Reporting skip / interact / open against the server-issued `displayEventId` | Whether a completion is valid and rewarded |
| Its opt-out setting | Claiming completion only when opening the link is the whole qualifying action | Caps, budgets, frequency, idempotency |
|  | Never throwing; degrading to "no offer" on any failure | Sponsor charge, reward ledger, wallet |

### Rules every adapter must follow

These are product properties, not suggestions, and code review should
reject an adapter that breaks them.

- **Separate presentation.** The offer is shown in the host's own UI surface
  and labelled "Sponsored". It is never inserted into model prompts, system
  instructions, model output, generated code, source files, terminal input,
  commit messages or any other developer content.
- **No surveillance.** The adapter reports only waits and actions the tool
  itself owns. No process inspection, no detection of which other tools are
  running, no reading of prompts, model responses, files, repository
  contents, environment variables or credentials. The SDK has no field that
  could carry them.
- **Honest completions.** The runtime claims completion only when opening
  the sponsor link is the whole qualifying action (no `requiredAction`).
  An adapter must not claim a further action (a deploy, an SDK init) that it
  cannot observe through an explicit, documented signal. Future
  outcome-based objectives need server-side verification (for example a
  sponsor-side attestation), not client heuristics.
- **Server authority.** The adapter never sends a reward amount, reward
  type, charge or eligibility decision. It cannot: the SDK's input types
  have no such fields and the server ignores unknown keys.
- **Legitimate integration surfaces only.** Build on the tool's public,
  documented extension mechanism, within the vendor's terms. Never on
  reverse-engineered or undocumented internals, and never by using the
  developer's credentials for that tool.
- **Explicit consent.** The developer installs and signs in to the adapter
  deliberately, can turn it off without uninstalling, and the server-side
  opt-in (`DeveloperProfile.adsEnabled`) still applies.

## What a legitimate integration for each target would need

None of these exist. For each one, the checklist is the same:

1. A **public, documented** extension surface that lets third-party code
   (a) observe a natural wait or lifecycle event the tool exposes, and
   (b) show content in a surface that is visibly separate from the model's
   input and output.
2. Confirmation, against the vendor's **current** documentation and terms of
   use, that showing third-party sponsored content through that surface is
   permitted.
3. A way to authenticate the developer to DevAds (see
   [Authentication](#authentication-for-non-editor-clients)).
4. An adapter package in this repository, its tests, and a change to
   `CLIENT_INTEGRATIONS`.

| Target | Notes |
| --- | --- |
| **Claude Code, Codex, Gemini CLI, OpenCode, Aider** (terminal AI agents) | Each would need a documented hook, plugin or extension point that exposes turn or task lifecycle and a display surface that does not feed the model's context. Whether each tool offers one, and whether its terms permit sponsored content there, must be verified per tool before any work starts. If a surface's output could reach the model's context, it is not usable. |
| **Cursor** | An editor built on VS Code. Whether the existing extension runs there is untested. If it does, it would currently report `VS_CODE`, which misattributes the client; a real adapter would need to identify itself honestly as `CURSOR`, which requires a documented way to detect the host editor (not process inspection). |
| **Other IDEs** (e.g. JetBrains) | Need an adapter in the IDE's own plugin language. The runtime is TypeScript, so a non-JavaScript host would reimplement the small runtime contract against the same HTTP protocol, or embed a JavaScript runtime. |
| **Custom and local agents** | The most direct path, because the agent's author controls the code: depend on `@devads/ad-sdk`, implement `AdapterHost`, send `CUSTOM_AGENT` or `LOCAL_AGENT`. Local models are fully supported by the loop, since rewards do not depend on who serves the model. |

Anything that would require a vendor's private API, privileged access or a
commercial agreement is out of scope until such an agreement exists, and is
then built behind the same adapter boundary.

## Authentication for non-editor clients

Adapters authenticate with the existing session token from the device-auth
flow (`POST /api/v1/auth/device/*`), which is designed for clients without
a browser of their own: the tool shows a code, the developer approves it in
the DevAds web app, and the tool stores the token. A CLI or agent adapter can
use that flow today.

**Known gap:** there is no API-key or machine credential. Headless agents
(CI, scheduled jobs) have no interactive moment to complete device auth.
That is deliberate for now: sponsored offers are meant for a developer who
is present, and a machine credential would widen the fraud surface. It
should be designed together with the fraud work, not added per adapter.

## Proof that the boundary holds

| Test | What it proves |
| --- | --- |
| `services/ad-server/src/__tests__/protocolAdapter.integration.test.ts` | A hypothetical third-party client (`OTHER`), written only against the public SDK, runs the whole loop against the real server and database: session, offer, open, completion, sponsor charge, reward ledger, wallet, full event trail, session end. A replayed completion neither re-rewards nor re-charges. The sponsor is a conference and the reward is not AI credits. No server, accounting or SDK code was changed for it. |
| `services/ad-server/src/__tests__/providerIndependence.test.ts` | No server, targeting or shared source hard-codes a named client type (outside the shared enum definition) or names an AI vendor. |
| `packages/ad-sdk/src/__tests__/adapterBoundary.test.ts` | The integration registry is complete and honest; SDK code has no client-specific branches or vendor names; the adapter runtime imports nothing outside the SDK; an example adapter sends only coarse protocol fields. |
| `packages/ad-sdk/src/__tests__/adapterRuntime.test.ts` | Runtime behavior: presentation only during an active wait, one offer at a time, stale-session recovery, completion policy, retry vs. final refusal, never throwing even when the host throws. |
| `apps/vscode-extension/src/__tests__/*` | The VS Code extension, now a host over the runtime, passes its entire existing suite unchanged. |
