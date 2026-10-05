import { describe, expect, it, vi } from "vitest";
import { DEV_CLIENT_TYPES, DevAdsClient, DevAdsError, type FetchLike, type FetchLikeInit } from "../index.js";

const BASE = "http://ads.test";
const TOKEN = "session-token-abc";

const sessionDTO = {
  id: "sess_1",
  clientType: "VS_CODE",
  clientVersion: "0.2.0",
  activityCategory: "testing",
  status: "ACTIVE",
  startedAt: "2026-09-29T10:00:00.000Z",
  endedAt: null,
};

const offerDTO = {
  displayEventId: "disp_1",
  offerId: "offer_1",
  campaignId: "camp_1",
  title: "Try the tool",
  description: "A sponsored tool",
  ctaUrl: "https://sponsor.example/try",
  requiredAction: "Run one command",
  rewardType: "AI_CREDITS",
  rewardAmountUnits: 500,
  expiresAt: null,
};

const walletDTO = {
  developerId: "dev_1",
  balances: [{ rewardType: "AI_CREDITS", availableUnits: 500, pendingUnits: 0, ledgerAvailableUnits: 500 }],
  recentLedger: [
    {
      id: "led_1",
      rewardType: "AI_CREDITS",
      campaignId: "camp_1",
      entryType: "EARNED",
      amountUnits: 500,
      status: "APPROVED",
      createdAt: "2026-09-29T10:05:00.000Z",
    },
  ],
};

interface Call {
  url: string;
  init: FetchLikeInit;
}

function mockFetch(responses: Array<{ status?: number; body?: unknown; throws?: unknown; badJson?: boolean }>) {
  const calls: Call[] = [];
  let i = 0;
  const fn: FetchLike = vi.fn(async (url: string, init: FetchLikeInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r.throws) throw r.throws;
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (r.badJson) throw new SyntaxError("Unexpected token");
        return r.body;
      },
    };
  });
  return { fetch: fn, calls };
}

function makeClient(fetch: FetchLike, overrides: Partial<ConstructorParameters<typeof DevAdsClient>[0]> = {}) {
  let n = 0;
  return new DevAdsClient({
    baseUrl: BASE,
    credentials: { token: TOKEN, developerId: "dev_1" },
    clientType: "VS_CODE",
    clientVersion: "0.2.0",
    fetch,
    generateEventId: () => `evt_${++n}`,
    ...overrides,
  });
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(call.init.body as string);
}

async function rejection(p: Promise<unknown>): Promise<DevAdsError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(DevAdsError);
    return err as DevAdsError;
  }
  throw new Error("expected promise to reject");
}

describe("DevAdsClient.startSession", () => {
  it("POSTs coarse session context with the bearer token and returns the validated session", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    const session = await makeClient(fetch).startSession({ activityCategory: "testing" });

    expect(session).toEqual(sessionDTO);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/v1/sessions`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({ clientType: "VS_CODE", clientVersion: "0.2.0", activityCategory: "testing" });
  });

  it("lets per-call context override the client defaults, for any client type", async () => {
    const { fetch, calls } = mockFetch([{ body: { ...sessionDTO, clientType: "CUSTOM_AGENT" } }]);
    await makeClient(fetch).startSession({ clientType: "CUSTOM_AGENT", clientVersion: "9.9.9" });
    expect(bodyOf(calls[0])).toMatchObject({ clientType: "CUSTOM_AGENT", clientVersion: "9.9.9" });
  });

  it("strips any non-schema field so nothing beyond coarse metadata is ever sent", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    const sneaky = { activityCategory: "build", prompt: "secret prompt", sourceCode: "const x = 1", apiKey: "sk-123" };
    await makeClient(fetch).startSession(sneaky as never);
    const sent = bodyOf(calls[0]);
    expect(Object.keys(sent).sort()).toEqual(["activityCategory", "clientType", "clientVersion"]);
    expect(JSON.stringify(sent)).not.toMatch(/secret prompt|const x|sk-123/);
  });

  it("rejects a non-coarse activityCategory without sending anything", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    const err = await rejection(makeClient(fetch).startSession({ activityCategory: "src/secret/file.ts" }));
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects when no client type is known", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    const err = await rejection(makeClient(fetch, { clientType: undefined }).startSession());
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects a malformed server response instead of trusting it", async () => {
    const { fetch } = mockFetch([{ body: { ...sessionDTO, status: "SOMETHING_ELSE" } }]);
    const err = await rejection(makeClient(fetch).startSession());
    expect(err.code).toBe("invalid_response");
    expect(err.status).toBe(200);
  });
});

describe("DevAdsClient.endSession", () => {
  it("POSTs to the session's end endpoint with no body", async () => {
    const ended = { ...sessionDTO, status: "ENDED", endedAt: "2026-09-29T11:00:00.000Z" };
    const { fetch, calls } = mockFetch([{ body: ended }]);
    const result = await makeClient(fetch).endSession("sess_1");

    expect(result).toEqual(ended);
    expect(calls[0].url).toBe(`${BASE}/api/v1/sessions/sess_1/end`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("URL-encodes the session id", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    await makeClient(fetch).endSession("a/b?c");
    expect(calls[0].url).toBe(`${BASE}/api/v1/sessions/a%2Fb%3Fc/end`);
  });

  it("rejects an empty session id without sending", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    expect((await rejection(makeClient(fetch).endSession(""))).code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("surfaces the server's error reason on a non-2xx status", async () => {
    const { fetch } = mockFetch([{ status: 403, body: { error: "forbidden" } }]);
    const err = await rejection(makeClient(fetch).endSession("sess_other"));
    expect(err).toMatchObject({ code: "rejected", status: 403, reason: "forbidden" });
  });
});

describe("DevAdsClient.requestSponsoredOpportunity", () => {
  it("GETs the offer endpoint with clientType and sessionId as query params", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: offerDTO } }]);
    const offer = await makeClient(fetch).requestSponsoredOpportunity({ sessionId: "sess_1" });

    expect(offer).toEqual(offerDTO);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/api/v1/sponsorships/offer`);
    expect(url.searchParams.get("clientType")).toBe("VS_CODE");
    expect(url.searchParams.get("sessionId")).toBe("sess_1");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("omits absent query params", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: null } }]);
    await makeClient(fetch).requestSponsoredOpportunity();
    expect(calls[0].url).toBe(`${BASE}/api/v1/sponsorships/offer?clientType=VS_CODE`);
  });

  it("sends interactionKind only when the caller gives one (the server defaults to WAIT)", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: null } }, { body: { offer: null } }]);
    const client = makeClient(fetch);
    await client.requestSponsoredOpportunity({ sessionId: "sess_1" });
    await client.requestSponsoredOpportunity({ sessionId: "sess_1", interactionKind: "DEVELOPER_INITIATED" });
    expect(new URL(calls[0].url).searchParams.has("interactionKind")).toBe(false);
    expect(new URL(calls[1].url).searchParams.get("interactionKind")).toBe("DEVELOPER_INITIATED");
  });

  it("rejects an unknown interactionKind without sending", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: null } }]);
    const bogus = { interactionKind: "BUILD_COMPLETE" } as unknown as Parameters<DevAdsClient["requestSponsoredOpportunity"]>[0];
    expect((await rejection(makeClient(fetch).requestSponsoredOpportunity(bogus))).code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("returns null when the server has no offer", async () => {
    const { fetch } = mockFetch([{ body: { offer: null } }]);
    expect(await makeClient(fetch).requestSponsoredOpportunity()).toBeNull();
  });

  it("requires a clientType or sessionId", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: null } }]);
    const err = await rejection(makeClient(fetch, { clientType: undefined }).requestSponsoredOpportunity());
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects an offer with a fractional reward amount (no floats touch rewards)", async () => {
    const { fetch } = mockFetch([{ body: { offer: { ...offerDTO, rewardAmountUnits: 1.5 } } }]);
    expect((await rejection(makeClient(fetch).requestSponsoredOpportunity())).code).toBe("invalid_response");
  });

  it("rejects an offer missing its displayEventId", async () => {
    const { displayEventId: _omit, ...noDisplay } = offerDTO;
    const { fetch } = mockFetch([{ body: { offer: noDisplay } }]);
    expect((await rejection(makeClient(fetch).requestSponsoredOpportunity())).code).toBe("invalid_response");
  });

  it("rejects an offer with a non-URL ctaUrl", async () => {
    const { fetch } = mockFetch([{ body: { offer: { ...offerDTO, ctaUrl: "javascript-ish nonsense" } } }]);
    expect((await rejection(makeClient(fetch).requestSponsoredOpportunity())).code).toBe("invalid_response");
  });

  it("maps 409 session_ended to a rejected error with the reason", async () => {
    const { fetch } = mockFetch([{ status: 409, body: { error: "session_ended" } }]);
    const err = await rejection(makeClient(fetch).requestSponsoredOpportunity({ sessionId: "sess_1" }));
    expect(err).toMatchObject({ code: "rejected", status: 409, reason: "session_ended" });
  });
});

describe("DevAdsClient.listSponsoredOpportunities", () => {
  const { displayEventId: _d, ...listed } = offerDTO;
  const listing = { ...listed, eligibleClientTypes: ["VS_CODE"] };
  const second = { ...listing, offerId: "offer_2", campaignId: "camp_2", rewardType: "API_CREDITS", eligibleClientTypes: [] };
  const listDTO = { sponsoredContentEnabled: true, offers: [listing, second] };

  it("GETs the read-only listing endpoint (not the selection endpoint) and returns every offer", async () => {
    const { fetch, calls } = mockFetch([{ body: listDTO }]);
    const result = await makeClient(fetch).listSponsoredOpportunities();

    expect(result).toEqual(listDTO);
    expect(result.offers).toHaveLength(2);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${BASE}/api/v1/sponsorships/offers`);
    expect(url.searchParams.get("clientType")).toBe("VS_CODE");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("lets the filter override the default client type", async () => {
    const { fetch, calls } = mockFetch([{ body: listDTO }]);
    await makeClient(fetch).listSponsoredOpportunities({ clientType: "AIDER" });
    expect(calls[0].url).toBe(`${BASE}/api/v1/sponsorships/offers?clientType=AIDER`);
  });

  it("lists every client type when the client has no default and no filter is given", async () => {
    const { fetch, calls } = mockFetch([{ body: listDTO }]);
    await makeClient(fetch, { clientType: undefined }).listSponsoredOpportunities();
    expect(calls[0].url).toBe(`${BASE}/api/v1/sponsorships/offers`);
  });

  it("returns an opted-out, empty list as-is", async () => {
    const { fetch } = mockFetch([{ body: { sponsoredContentEnabled: false, offers: [] } }]);
    expect(await makeClient(fetch).listSponsoredOpportunities()).toEqual({ sponsoredContentEnabled: false, offers: [] });
  });

  it("rejects an unknown client type without sending", async () => {
    const { fetch, calls } = mockFetch([{ body: listDTO }]);
    const err = await rejection(makeClient(fetch).listSponsoredOpportunities({ clientType: "NOTEPAD" as never }));
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("strips a displayEventId the server should never send, so a listing can't be reported as a display", async () => {
    const { fetch } = mockFetch([{ body: { ...listDTO, offers: [{ ...listing, displayEventId: "disp_x" }] } }]);
    const result = await makeClient(fetch).listSponsoredOpportunities();
    expect(result.offers[0]).not.toHaveProperty("displayEventId");
  });

  it("rejects fractional reward amounts, unknown reward types and a missing opt-in flag", async () => {
    for (const bad of [
      { ...listDTO, offers: [{ ...listing, rewardAmountUnits: 2.5 }] },
      { ...listDTO, offers: [{ ...listing, rewardType: "DOGECOIN" }] },
      { ...listDTO, offers: [{ ...listing, eligibleClientTypes: ["NOTEPAD"] }] },
      { offers: [listing] },
      { sponsoredContentEnabled: true, offers: null },
    ]) {
      const { fetch } = mockFetch([{ body: bad }]);
      expect((await rejection(makeClient(fetch).listSponsoredOpportunities())).code).toBe("invalid_response");
    }
  });

  it("surfaces server refusals with the reason", async () => {
    const { fetch } = mockFetch([{ status: 404, body: { error: "developer_not_found" } }]);
    const err = await rejection(makeClient(fetch).listSponsoredOpportunities());
    expect(err).toMatchObject({ code: "rejected", status: 404, reason: "developer_not_found" });
  });

  it("fails fast as unauthenticated without a token", async () => {
    const { fetch, calls } = mockFetch([{ body: listDTO }]);
    const client = makeClient(fetch, { credentials: { token: () => undefined } });
    expect((await rejection(client.listSponsoredOpportunities())).code).toBe("unauthenticated");
    expect(calls).toHaveLength(0);
  });
});

describe("DevAdsClient.reportOfferEvent", () => {
  it.each(["OFFER_SKIPPED", "OFFER_OPENED", "OFFER_INTERACTED"] as const)(
    "POSTs a %s event referencing the displayEventId",
    async (type) => {
      const { fetch, calls } = mockFetch([{ body: { ok: true } }]);
      const result = await makeClient(fetch).reportOfferEvent({ type, displayEventId: "disp_1", sessionId: "sess_1" });

      expect(result).toEqual({ ok: true, eventId: "evt_1" });
      expect(calls[0].url).toBe(`${BASE}/api/v1/sponsorships/events`);
      expect(calls[0].init.method).toBe("POST");
      expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(bodyOf(calls[0])).toEqual({ eventId: "evt_1", type, displayEventId: "disp_1", sessionId: "sess_1" });
    }
  );

  it("uses a caller-supplied eventId so retries stay idempotent", async () => {
    const { fetch, calls } = mockFetch([{ body: { ok: true, idempotent: true } }]);
    const result = await makeClient(fetch).reportOfferEvent({
      type: "OFFER_OPENED",
      displayEventId: "disp_1",
      eventId: "retry-key",
    });
    expect(bodyOf(calls[0]).eventId).toBe("retry-key");
    expect(result).toEqual({ ok: true, idempotent: true, eventId: "retry-key" });
  });

  it.each(["OFFER_COMPLETED", "OFFER_DISPLAYED", "OFFER_REQUESTED"])(
    "refuses %s without sending (server-recorded or completion-only)",
    async (type) => {
      const { fetch, calls } = mockFetch([{ body: { ok: true } }]);
      const err = await rejection(makeClient(fetch).reportOfferEvent({ type: type as never, displayEventId: "disp_1" }));
      expect(err.code).toBe("invalid_request");
      expect(calls).toHaveLength(0);
    }
  );

  it("does not forward arbitrary extra fields such as metadata", async () => {
    const { fetch, calls } = mockFetch([{ body: { ok: true } }]);
    await makeClient(fetch).reportOfferEvent({
      type: "OFFER_OPENED",
      displayEventId: "disp_1",
      metadata: { code: "secret" },
    } as never);
    expect(bodyOf(calls[0])).not.toHaveProperty("metadata");
  });

  it("rejects a response that is not an ok:true acknowledgement", async () => {
    const { fetch } = mockFetch([{ body: { ok: false } }]);
    const err = await rejection(makeClient(fetch).reportOfferEvent({ type: "OFFER_SKIPPED", displayEventId: "disp_1" }));
    expect(err.code).toBe("invalid_response");
  });
});

describe("DevAdsClient.completeQualifyingAction", () => {
  it("POSTs OFFER_COMPLETED correlated to the display and returns the server's reward decision", async () => {
    const { fetch, calls } = mockFetch([
      { body: { ok: true, rewarded: true, reward: { rewardType: "AI_CREDITS", amountUnits: 500, status: "APPROVED" } } },
    ]);
    const result = await makeClient(fetch).completeQualifyingAction({ displayEventId: "disp_1", sessionId: "sess_1" });

    expect(calls[0].url).toBe(`${BASE}/api/v1/sponsorships/events`);
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(bodyOf(calls[0])).toEqual({
      eventId: "evt_1",
      type: "OFFER_COMPLETED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(result).toEqual({
      ok: true,
      rewarded: true,
      reward: { rewardType: "AI_CREDITS", amountUnits: 500, status: "APPROVED" },
      eventId: "evt_1",
    });
  });

  it("never sends a reward amount or type, even if the caller tries", async () => {
    const { fetch, calls } = mockFetch([{ body: { ok: true, idempotent: true } }]);
    await makeClient(fetch).completeQualifyingAction({
      displayEventId: "disp_1",
      rewardAmountUnits: 999999,
      rewardType: "CASH",
    } as never);
    const sent = bodyOf(calls[0]);
    expect(sent).not.toHaveProperty("rewardAmountUnits");
    expect(sent).not.toHaveProperty("rewardType");
  });

  it("surfaces cap refusals as rejected with the server reason", async () => {
    const { fetch } = mockFetch([{ status: 409, body: { error: "developer_daily_cap_reached" } }]);
    const err = await rejection(makeClient(fetch).completeQualifyingAction({ displayEventId: "disp_1" }));
    expect(err).toMatchObject({ code: "rejected", status: 409, reason: "developer_daily_cap_reached" });
  });

  it("rejects a reward with a fractional amount", async () => {
    const { fetch } = mockFetch([
      { body: { ok: true, rewarded: true, reward: { rewardType: "AI_CREDITS", amountUnits: 0.5, status: "APPROVED" } } },
    ]);
    const err = await rejection(makeClient(fetch).completeQualifyingAction({ displayEventId: "disp_1" }));
    expect(err.code).toBe("invalid_response");
  });

  it("requires a displayEventId", async () => {
    const { fetch, calls } = mockFetch([{ body: { ok: true } }]);
    const err = await rejection(makeClient(fetch).completeQualifyingAction({ displayEventId: "" }));
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });
});

describe("DevAdsClient.getWallet", () => {
  it("GETs the wallet for the configured developer and returns the validated wallet", async () => {
    const { fetch, calls } = mockFetch([{ body: walletDTO }]);
    const wallet = await makeClient(fetch).getWallet();

    expect(wallet).toEqual(walletDTO);
    expect(calls[0].url).toBe(`${BASE}/api/v1/wallet?developerId=dev_1`);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("accepts an explicit developerId and an async developerId provider", async () => {
    const a = mockFetch([{ body: walletDTO }]);
    await makeClient(a.fetch).getWallet("dev_explicit");
    expect(a.calls[0].url).toBe(`${BASE}/api/v1/wallet?developerId=dev_explicit`);

    const b = mockFetch([{ body: walletDTO }]);
    await makeClient(b.fetch, { credentials: { token: TOKEN, developerId: async () => "dev_async" } }).getWallet();
    expect(b.calls[0].url).toBe(`${BASE}/api/v1/wallet?developerId=dev_async`);
  });

  it("rejects when no developerId is available", async () => {
    const { fetch, calls } = mockFetch([{ body: walletDTO }]);
    const err = await rejection(makeClient(fetch, { credentials: { token: TOKEN } }).getWallet());
    expect(err.code).toBe("invalid_request");
    expect(calls).toHaveLength(0);
  });

  it("rejects a wallet with fractional balances", async () => {
    const bad = { ...walletDTO, balances: [{ ...walletDTO.balances[0], availableUnits: 10.25 }] };
    const { fetch } = mockFetch([{ body: bad }]);
    expect((await rejection(makeClient(fetch).getWallet())).code).toBe("invalid_response");
  });

  it("rejects a wallet with an unknown reward type", async () => {
    const bad = { ...walletDTO, balances: [{ ...walletDTO.balances[0], rewardType: "DOGECOIN" }] };
    const { fetch } = mockFetch([{ body: bad }]);
    expect((await rejection(makeClient(fetch).getWallet())).code).toBe("invalid_response");
  });
});

describe("authentication", () => {
  it("re-reads an async token provider on every call", async () => {
    const tokens = ["tok-1", "tok-2"];
    const { fetch, calls } = mockFetch([{ body: { offer: null } }]);
    const client = makeClient(fetch, { credentials: { token: async () => tokens.shift() } });
    await client.requestSponsoredOpportunity();
    await client.requestSponsoredOpportunity();
    expect(calls.map((c) => c.init.headers.Authorization)).toEqual(["Bearer tok-1", "Bearer tok-2"]);
  });

  it("fails fast as unauthenticated when no token is available, without sending", async () => {
    const { fetch, calls } = mockFetch([{ body: { offer: null } }]);
    const client = makeClient(fetch, { credentials: { token: () => undefined } });
    expect((await rejection(client.requestSponsoredOpportunity())).code).toBe("unauthenticated");
    expect((await rejection(client.startSession())).code).toBe("unauthenticated");
    expect(calls).toHaveLength(0);
  });

  it("maps a 401 to rejected/unauthorized", async () => {
    const { fetch } = mockFetch([{ status: 401, body: { error: "unauthorized" } }]);
    const err = await rejection(makeClient(fetch).getWallet());
    expect(err).toMatchObject({ code: "rejected", status: 401, reason: "unauthorized" });
  });
});

describe("transport", () => {
  it("strips trailing slashes from baseUrl", async () => {
    const { fetch, calls } = mockFetch([{ body: sessionDTO }]);
    await makeClient(fetch, { baseUrl: `${BASE}///` }).endSession("sess_1");
    expect(calls[0].url).toBe(`${BASE}/api/v1/sessions/sess_1/end`);
  });

  it("maps a thrown fetch to a network error", async () => {
    const { fetch } = mockFetch([{ throws: new TypeError("fetch failed") }]);
    expect((await rejection(makeClient(fetch).getWallet())).code).toBe("network");
  });

  it("aborts and reports a timeout when the server is too slow", async () => {
    const slowFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const err = await rejection(makeClient(slowFetch, { timeoutMs: 10 }).getWallet());
    expect(err.code).toBe("timeout");
  });

  it("treats a 2xx non-JSON body as an invalid response", async () => {
    const { fetch } = mockFetch([{ badJson: true }]);
    expect((await rejection(makeClient(fetch).getWallet())).code).toBe("invalid_response");
  });

  it("treats a non-2xx non-JSON body as rejected with no reason", async () => {
    const { fetch } = mockFetch([{ status: 502, badJson: true }]);
    const err = await rejection(makeClient(fetch).getWallet());
    expect(err).toMatchObject({ code: "rejected", status: 502, reason: undefined });
  });
});

describe("public surface", () => {
  it("exposes every shared client type without favouring any one tool", () => {
    expect([...DEV_CLIENT_TYPES]).toEqual([
      "VS_CODE",
      "CLAUDE_CODE",
      "CODEX",
      "GEMINI",
      "CURSOR",
      "OPENCODE",
      "AIDER",
      "CUSTOM_AGENT",
      "LOCAL_AGENT",
      "OTHER",
      "WEB",
    ]);
  });
});
