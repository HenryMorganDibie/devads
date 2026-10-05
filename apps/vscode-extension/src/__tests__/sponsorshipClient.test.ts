import { afterEach, describe, expect, it, vi } from "vitest";
import { DevAdsError } from "@devads/ad-sdk";
import {
  createSponsorshipClient,
  describeSponsorshipError,
  isStaleSessionError,
  SPONSORSHIP_CLIENT_TYPE,
} from "../sponsorshipClient";
import { SponsorshipSession } from "../sponsorshipSession";
import { SponsoredOfferController } from "../sponsoredOffer";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const OFFER = {
  displayEventId: "disp_1",
  offerId: "offer_1",
  campaignId: "camp_1",
  title: "Try Acme Cloud",
  description: "Deploy previews in one click.",
  ctaUrl: "https://acme.example/devads",
  requiredAction: null,
  rewardType: "AI_CREDITS",
  rewardAmountUnits: 50,
  expiresAt: null,
};

const SESSION = {
  id: "sess_1",
  clientType: "VS_CODE",
  clientVersion: "0.1.0",
  activityCategory: null,
  status: "ACTIVE",
  startedAt: "2026-09-29T00:00:00.000Z",
  endedAt: null,
};

afterEach(() => vi.restoreAllMocks());

describe("createSponsorshipClient (real @devads/ad-sdk, fake fetch)", () => {
  it("identifies as VS_CODE with the extension's own version and reuses the existing session token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SESSION));
    const client = createSponsorshipClient({
      adServerUrl: "http://localhost:4000",
      extensionVersion: "0.1.0",
      getToken: async () => "device-auth-token",
      getDeveloperId: () => "dev_1",
      fetch: fetchImpl,
    })!;
    await client.startSession();

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/v1/sessions");
    expect(init.headers.Authorization).toBe("Bearer device-auth-token");
    expect(JSON.parse(init.body)).toEqual({ clientType: SPONSORSHIP_CLIENT_TYPE, clientVersion: "0.1.0" });
  });

  it("re-reads the token on every call, so sign-out is picked up without rebuilding the client", async () => {
    let token: string | undefined = "t1";
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SESSION));
    const client = createSponsorshipClient({
      adServerUrl: "http://localhost:4000",
      extensionVersion: "0.1.0",
      getToken: () => token,
      getDeveloperId: () => "dev_1",
      fetch: fetchImpl,
    })!;
    await client.startSession();
    token = undefined;
    await expect(client.startSession()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("truncates an over-long version to the shared schema's 32-char limit instead of failing validation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SESSION));
    const client = createSponsorshipClient({
      adServerUrl: "http://localhost:4000",
      extensionVersion: "1.2.3-" + "x".repeat(60),
      getToken: () => "t",
      getDeveloperId: () => "dev_1",
      fetch: fetchImpl,
    })!;
    await client.startSession();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).clientVersion).toHaveLength(32);
  });

  it("returns null instead of throwing when the SDK cannot be constructed (no fetch in the host)", () => {
    vi.stubGlobal("fetch", undefined);
    try {
      expect(
        createSponsorshipClient({
          adServerUrl: "http://localhost:4000",
          extensionVersion: "0.1.0",
          getToken: () => "t",
          getDeveloperId: () => "dev_1",
        })
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("privacy: an end-to-end offer flow sends only client type/version, interaction kind and session/offer ids", async () => {
    const sent: Array<{ url: string; body?: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init: { body?: string }) => {
      sent.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
      if (url.includes("/api/v1/sessions")) return jsonResponse(SESSION);
      if (url.includes("/api/v1/sponsorships/offer")) return jsonResponse({ offer: OFFER });
      return jsonResponse({ ok: true, rewarded: true, reward: { rewardType: "AI_CREDITS", amountUnits: 50, status: "APPROVED" } });
    });
    const getClient = () =>
      createSponsorshipClient({
        adServerUrl: "http://localhost:4000",
        extensionVersion: "0.1.0",
        getToken: () => "t",
        getDeveloperId: () => "dev_1",
        fetch: fetchImpl,
      });
    const session = new SponsorshipSession(getClient);
    const controller = new SponsoredOfferController({
      getClient,
      session,
      view: { show: vi.fn(), hide: vi.fn() },
      openExternal: async () => true,
    });
    const tracker = { elapsedSeconds: () => 30, isStillRunning: () => true };
    await controller.maybeRequest(tracker, {
      enabled: true,
      minimumWaitSeconds: 8,
      isSignedIn: true,
      standardAdShowing: false,
    });
    await controller.open();

    expect(sent.map((s) => new URL(s.url).pathname)).toEqual([
      "/api/v1/sessions",
      "/api/v1/sponsorships/offer",
      "/api/v1/sponsorships/events",
      "/api/v1/sponsorships/events",
    ]);
    // The interaction kind is a fixed enum value (the terminal wait is WAIT), never anything about the command.
    expect(new URL(sent[1].url).searchParams.toString()).toBe("clientType=VS_CODE&sessionId=sess_1&interactionKind=WAIT");
    expect(sent[0].body).toEqual({ clientType: "VS_CODE", clientVersion: "0.1.0" });
    for (const event of sent.slice(2)) {
      expect(Object.keys(event.body as object).sort()).toEqual(["displayEventId", "eventId", "sessionId", "type"]);
    }
    const all = JSON.stringify(sent);
    for (const forbidden of ["npm", "language", "platform", "command", "path", "installationId"]) {
      expect(all).not.toContain(forbidden);
    }
  });
});

describe("sponsorship error helpers", () => {
  it("describes SDK errors by code and server reason only", () => {
    expect(describeSponsorshipError(new DevAdsError("rejected", "x", { status: 409, reason: "session_ended" }))).toBe(
      "rejected (session_ended)"
    );
    expect(describeSponsorshipError(new DevAdsError("timeout", "x"))).toBe("timeout");
    expect(describeSponsorshipError(new Error("secret detail"))).toBe("unexpected_error");
  });

  it("recognises server replies that mean the cached session is unusable", () => {
    expect(isStaleSessionError(new DevAdsError("rejected", "x", { status: 409, reason: "session_ended" }))).toBe(true);
    expect(isStaleSessionError(new DevAdsError("rejected", "x", { status: 403, reason: "forbidden" }))).toBe(true);
    expect(isStaleSessionError(new DevAdsError("network", "x"))).toBe(false);
  });
});
