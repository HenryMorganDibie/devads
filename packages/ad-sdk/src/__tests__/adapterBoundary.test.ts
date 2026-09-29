import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_INTEGRATIONS,
  DEV_CLIENT_TYPES,
  DevAdsClient,
  DevelopmentSessionManager,
  SponsoredOfferRuntime,
  isImplementedIntegration,
  type AdapterHost,
  type FetchLike,
  type FetchLikeInit,
  type SponsoredOpportunity,
} from "../index.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(SRC, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("integration registry", () => {
  it("covers every protocol client type exactly once", () => {
    expect(Object.keys(CLIENT_INTEGRATIONS).sort()).toEqual([...DEV_CLIENT_TYPES].sort());
  });

  it("marks only the VS Code extension as implemented", () => {
    const implemented = DEV_CLIENT_TYPES.filter(isImplementedIntegration);
    expect(implemented).toEqual(["VS_CODE"]);
  });

  it("every implemented entry points at an adapter that exists in this repository, and no other entry claims one", () => {
    for (const type of DEV_CLIENT_TYPES) {
      const entry = CLIENT_INTEGRATIONS[type];
      if (entry.status === "IMPLEMENTED") {
        expect(entry.implementation, type).toBeTruthy();
        const pkg = JSON.parse(readFileSync(join(REPO, entry.implementation!, "package.json"), "utf8"));
        expect(Object.keys(pkg.dependencies ?? {}).concat(Object.keys(pkg.devDependencies ?? {}))).toContain(
          "@devads/ad-sdk"
        );
      } else {
        expect(entry.implementation, type).toBeUndefined();
      }
    }
  });
});

describe("provider independence of the SDK", () => {
  const files = sourceFiles(SRC);
  const VENDORS = /\b(anthropic|openai|google|mistral|claude|gemini|codex)\b/i;
  const CLIENT_LITERAL = new RegExp(`["'\`](${DEV_CLIENT_TYPES.join("|")})["'\`]`);

  it("scans the SDK sources", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("no SDK code branches on or hard-codes a specific client type (only the integration registry lists them)", () => {
    for (const file of files) {
      if (relative(SRC, file) === join("adapter", "integrations.ts")) continue;
      expect(readFileSync(file, "utf8"), relative(SRC, file)).not.toMatch(CLIENT_LITERAL);
    }
  });

  it("no SDK code names an AI vendor (outside the integration registry's enum keys)", () => {
    for (const file of files) {
      if (relative(SRC, file) === join("adapter", "integrations.ts")) continue;
      // types.ts documents the enum's example values in one comment line.
      const text = readFileSync(file, "utf8").replace(/^\s*\/\*\* Which tool the developer is using.*$/m, "");
      expect(text, relative(SRC, file)).not.toMatch(VENDORS);
    }
  });

  it("the adapter runtime has no Node, VS Code or DOM dependency a non-editor host would lack", () => {
    for (const file of sourceFiles(join(SRC, "adapter"))) {
      const imports = [...readFileSync(file, "utf8").matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map(
        (m) => m[1]
      );
      expect(imports.length, relative(SRC, file)).toBeGreaterThan(0);
      for (const spec of imports) expect(spec, relative(SRC, file)).toMatch(/^\.\.?\//);
    }
  });
});

/**
 * A hypothetical third-party adapter, written only against the SDK's public
 * exports, the way an adapter for any future client would be. It is not an
 * integration with any real tool: it proves the boundary, namely that a new
 * client needs a host implementation and a client type, and nothing else.
 */
class ExampleAIClientAdapter {
  readonly shown: SponsoredOpportunity[] = [];
  readonly notices: string[] = [];
  readonly session: DevelopmentSessionManager;
  readonly offers: SponsoredOfferRuntime;
  private turnActive = false;

  constructor(client: DevAdsClient) {
    const host: AdapterHost = {
      presentOffer: (offer) => this.shown.push(offer),
      dismissOffer: () => {},
      openExternal: async () => true,
      notify: (message) => this.notices.push(message),
    };
    this.session = new DevelopmentSessionManager(() => client);
    this.offers = new SponsoredOfferRuntime({ getClient: () => client, session: this.session, host });
  }

  /** The tool's own "a long agent turn is in progress" signal. */
  async onTurnStarted(): Promise<void> {
    this.turnActive = true;
    await this.offers.offerDuringWait({ isActive: () => this.turnActive });
  }

  onTurnFinished(): void {
    this.turnActive = false;
    this.offers.waitEnded();
  }
}

/** In-memory stand-in for the ad server that records exactly what the adapter sent. */
function fakeServer() {
  const requests: Array<{ method: string; path: string; query: Record<string, string>; body: unknown }> = [];
  const fetch: FetchLike = async (url: string, init: FetchLikeInit) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
    const json = (status: number, payload: unknown) => ({ ok: status < 300, status, json: async () => payload });
    if (u.pathname === "/api/v1/sessions") {
      return json(201, {
        id: "sess_x",
        clientType: body.clientType,
        clientVersion: body.clientVersion ?? null,
        activityCategory: null,
        status: "ACTIVE",
        startedAt: "2026-09-29T10:00:00.000Z",
        endedAt: null,
      });
    }
    if (u.pathname === "/api/v1/sponsorships/offer") {
      return json(200, {
        offer: {
          displayEventId: "disp_x",
          offerId: "offer_x",
          campaignId: "camp_x",
          title: "Register for the course",
          description: "A sponsored course from an education company",
          ctaUrl: "https://edu.example/course",
          requiredAction: null,
          rewardType: "OTHER",
          rewardAmountUnits: 1,
          expiresAt: null,
        },
      });
    }
    if (u.pathname === "/api/v1/sponsorships/events") {
      const completed = body.type === "OFFER_COMPLETED";
      return json(200, {
        ok: true,
        ...(completed ? { rewarded: true, reward: { rewardType: "OTHER", amountUnits: 1, status: "APPROVED" } } : {}),
      });
    }
    return json(404, { error: "not_found" });
  };
  return { fetch, requests };
}

describe("a new client adapter needs only a host and a client type", () => {
  it("drives session -> offer -> open -> completion without any client-specific code in the SDK", async () => {
    const server = fakeServer();
    let n = 0;
    const client = new DevAdsClient({
      baseUrl: "http://ads.test",
      credentials: { token: "tok" },
      clientType: "CUSTOM_AGENT",
      clientVersion: "0.0.1",
      fetch: server.fetch,
      generateEventId: () => `evt_${++n}`,
    });
    const adapter = new ExampleAIClientAdapter(client);

    await adapter.onTurnStarted();
    expect(adapter.shown.map((o) => o.displayEventId)).toEqual(["disp_x"]);
    await adapter.offers.open();
    adapter.onTurnFinished();
    await adapter.session.end();

    expect(adapter.notices).toEqual(['DevAds: you earned 1 unit (other reward) from "Register for the course".']);
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/v1/sessions",
      "GET /api/v1/sponsorships/offer",
      "POST /api/v1/sponsorships/events",
      "POST /api/v1/sponsorships/events",
      "POST /api/v1/sessions/sess_x/end",
    ]);
    // Only coarse protocol fields leave the adapter; never a reward amount or anything about the developer's work.
    expect(server.requests[0].body).toEqual({ clientType: "CUSTOM_AGENT", clientVersion: "0.0.1" });
    expect(server.requests[1].query).toEqual({ clientType: "CUSTOM_AGENT", sessionId: "sess_x" });
    expect(server.requests[2].body).toEqual({ eventId: "evt_1", type: "OFFER_OPENED", displayEventId: "disp_x", sessionId: "sess_x" });
    expect(server.requests[3].body).toEqual({ eventId: "evt_2", type: "OFFER_COMPLETED", displayEventId: "disp_x", sessionId: "sess_x" });
    for (const r of server.requests) {
      expect(JSON.stringify({ query: r.query, body: r.body })).not.toMatch(/amount|reward|charge|prompt|source|path|secret|env/i);
    }
  });
});
