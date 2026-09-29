import { describe, expect, it, vi } from "vitest";
import {
  DevAdsClient,
  DevAdsError,
  DevelopmentSessionManager,
  SponsoredOfferRuntime,
  fitsWindow,
  type AdapterHost,
  type FetchLike,
  type FetchLikeInit,
  type ProtocolClient,
  type SponsoredOpportunity,
} from "../index.js";

const creative = (durationSeconds: number) => ({
  id: `cr_${durationSeconds}`,
  kind: "VIDEO" as const,
  url: `https://devads.example/beta-creatives/product-${durationSeconds}s.mp4`,
  posterUrl: `https://devads.example/beta-creatives/product-${durationSeconds}s.jpg`,
  mimeType: "video/mp4",
  durationSeconds,
  width: 1280,
  height: 720,
});

function videoOffer(durationSeconds = 15): SponsoredOpportunity {
  return {
    displayEventId: "disp_v",
    offerId: "offer_v",
    campaignId: "camp_v",
    title: "DevAds Beta Opportunity: a product",
    description: "A first-party beta video",
    ctaUrl: "https://devads.example/beta/opportunity/product?d=disp_v",
    requiredAction: "Open the project page, spend at least 15 seconds on it, then confirm",
    rewardType: "BETA_CREDITS",
    rewardAmountUnits: 25,
    expiresAt: null,
    campaignMode: "BETA",
    minEngagementSeconds: 15,
    presentationMode: "VIDEO",
    creative: creative(durationSeconds),
  };
}

function setup(offer: SponsoredOpportunity | null) {
  const client = {
    startSession: vi.fn().mockResolvedValue({ id: "sess_1" }),
    endSession: vi.fn(),
    requestSponsoredOpportunity: vi.fn().mockResolvedValue(offer),
    reportOfferEvent: vi.fn().mockResolvedValue({ ok: true, eventId: "e" }),
    completeQualifyingAction: vi.fn(),
  };
  const host = { presentOffer: vi.fn(), dismissOffer: vi.fn(), openExternal: vi.fn().mockResolvedValue(true), log: vi.fn() } satisfies AdapterHost;
  const protocol = client as unknown as ProtocolClient;
  const session = new DevelopmentSessionManager(() => protocol, host.log);
  const runtime = new SponsoredOfferRuntime({ getClient: () => protocol, session, host });
  return { client, protocol, host, runtime };
}

describe("fitsWindow", () => {
  it("always fits CARD offers and offers from servers without a presentation mode", () => {
    const card = { ...videoOffer(), presentationMode: "CARD" as const, creative: null };
    expect(fitsWindow(card, undefined)).toBe(true);
    expect(fitsWindow({ ...card, presentationMode: undefined }, 0)).toBe(true);
  });

  it("fits a VIDEO offer only when its creative is no longer than the window", () => {
    expect(fitsWindow(videoOffer(15), 15)).toBe(true);
    expect(fitsWindow(videoOffer(15), 14)).toBe(false);
    expect(fitsWindow(videoOffer(15), undefined)).toBe(false);
    expect(fitsWindow({ ...videoOffer(), creative: null }, 60)).toBe(false);
  });
});

describe("SponsoredOfferRuntime with a wait window", () => {
  it("sends only the whole-second window estimate with the request", async () => {
    const { client, host, runtime } = setup(videoOffer(15));
    await runtime.offerDuringWait({ isActive: () => true, availableSeconds: () => 17.8 });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", availableWaitSeconds: 17 });
    expect(host.presentOffer).toHaveBeenCalledWith(videoOffer(15));
  });

  it("omits the window when the host has no estimate", async () => {
    const { client, runtime } = setup(null);
    await runtime.offerDuringWait({ isActive: () => true, availableSeconds: () => undefined });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1" });
  });

  it("does not start a video that no longer fits once the response arrives", async () => {
    let left = 20;
    const { client, host, runtime } = setup(videoOffer(20));
    client.requestSponsoredOpportunity.mockImplementation(async () => {
      left = 12; // the request took long enough that 20s no longer fits
      return videoOffer(20);
    });
    await runtime.offerDuringWait({ isActive: () => true, availableSeconds: () => left });
    expect(host.presentOffer).not.toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
  });

  it("clamps absurd estimates into the protocol's range", async () => {
    const { client, runtime } = setup(null);
    await runtime.offerDuringWait({ isActive: () => true, availableSeconds: () => 1e9 });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", availableWaitSeconds: 3600 });
  });
});

describe("DevAdsClient video offers", () => {
  function fetchReturning(body: unknown) {
    const calls: string[] = [];
    const fetch: FetchLike = vi.fn(async (url: string, _init: FetchLikeInit) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }) as unknown as FetchLike;
    return { fetch, calls };
  }
  const client = (fetch: FetchLike) =>
    new DevAdsClient({ baseUrl: "https://api.devads.example", credentials: { token: "t" }, clientType: "VS_CODE", fetch });

  it("sends availableWaitSeconds as a query param and validates the creative in the response", async () => {
    const { fetch, calls } = fetchReturning({ offer: videoOffer(10) });
    const offer = await client(fetch).requestSponsoredOpportunity({ availableWaitSeconds: 12 });
    expect(new URL(calls[0]).searchParams.get("availableWaitSeconds")).toBe("12");
    expect(offer?.creative?.durationSeconds).toBe(10);
  });

  it("rejects an out-of-range window before sending anything", async () => {
    const { fetch, calls } = fetchReturning({ offer: null });
    await expect(client(fetch).requestSponsoredOpportunity({ availableWaitSeconds: -1 })).rejects.toBeInstanceOf(DevAdsError);
    expect(calls).toHaveLength(0);
  });
});
