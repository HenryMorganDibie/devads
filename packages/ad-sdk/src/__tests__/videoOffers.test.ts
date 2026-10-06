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
  type QualifyingInteraction,
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

/** A WAIT interaction that can estimate its remaining time (like the VS Code terminal wait). */
const timedWait = (availableSeconds: () => number | undefined, active: () => boolean = () => true): QualifyingInteraction => ({
  kind: "WAIT",
  isActive: active,
  availableSeconds,
});

describe("SponsoredOfferRuntime with an interaction that reports available seconds", () => {
  it("sends only the whole-second estimate, alongside the interaction kind", async () => {
    const { client, host, runtime } = setup(videoOffer(15));
    await runtime.offerDuring(timedWait(() => 17.8));
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "WAIT",
      availableSeconds: 17,
    });
    expect(host.presentOffer).toHaveBeenCalledWith(videoOffer(15));
  });

  it("omits availableSeconds when the interaction has no estimate right now", async () => {
    const { client, runtime } = setup(null);
    await runtime.offerDuring(timedWait(() => undefined));
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", interactionKind: "WAIT" });
  });

  it("treats a throwing or non-finite estimate as no estimate", async () => {
    for (const estimate of [() => Number.NaN, () => Number.POSITIVE_INFINITY, () => { throw new Error("boom"); }]) {
      const { client, runtime } = setup(null);
      await runtime.offerDuring(timedWait(estimate));
      expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", interactionKind: "WAIT" });
    }
  });

  it("does not start a video that no longer fits once the response arrives", async () => {
    let left = 20;
    const { client, host, runtime } = setup(videoOffer(20));
    client.requestSponsoredOpportunity.mockImplementation(async () => {
      left = 12; // the request took long enough that 20s no longer fits
      return videoOffer(20);
    });
    await runtime.offerDuring(timedWait(() => left));
    expect(host.presentOffer).not.toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
  });

  it("clamps absurd estimates into the protocol's range", async () => {
    const { client, runtime } = setup(null);
    await runtime.offerDuring(timedWait(() => 1e9));
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "WAIT",
      availableSeconds: 3600,
    });
    const negative = setup(null);
    await negative.runtime.offerDuring(timedWait(() => -5));
    expect(negative.client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "WAIT",
      availableSeconds: 0,
    });
  });

  it("the capability is not wait-specific: any kind that reports available seconds can be offered video", async () => {
    const { client, host, runtime } = setup(videoOffer(10));
    await runtime.offerDuring({ kind: "OTHER", isActive: () => true, availableSeconds: () => 12 });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "OTHER",
      availableSeconds: 12,
    });
    expect(host.presentOffer).toHaveBeenCalledWith(videoOffer(10));
  });
});

describe("interactions without available seconds never attempt video", () => {
  const developerInitiated: QualifyingInteraction = { kind: "DEVELOPER_INITIATED", isActive: () => true };

  it("a DEVELOPER_INITIATED interaction sends no availableSeconds, so the server can only serve CARD", async () => {
    const card = { ...videoOffer(), presentationMode: "CARD" as const, creative: null };
    const { client, host, runtime } = setup(card);
    await runtime.offerDuring(developerInitiated);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "DEVELOPER_INITIATED",
    });
    expect(client.requestSponsoredOpportunity.mock.calls[0][0]).not.toHaveProperty("availableSeconds");
    expect(host.presentOffer).toHaveBeenCalledWith(card);
  });

  it("refuses to present a VIDEO offer for a DEVELOPER_INITIATED interaction even if a server sent one", async () => {
    const { host, runtime } = setup(videoOffer(10));
    await runtime.offerDuring(developerInitiated);
    expect(host.presentOffer).not.toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
  });

  it("the legacy WaitHandle path stays CARD-only (it has no availableSeconds capability)", async () => {
    const { client, host, runtime } = setup(videoOffer(10));
    await runtime.offerDuringWait({ isActive: () => true });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", interactionKind: "WAIT" });
    expect(host.presentOffer).not.toHaveBeenCalled();
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

  it("sends availableSeconds as a query param and validates the creative in the response", async () => {
    const { fetch, calls } = fetchReturning({ offer: videoOffer(10) });
    const offer = await client(fetch).requestSponsoredOpportunity({ availableSeconds: 12 });
    expect(new URL(calls[0]).searchParams.get("availableSeconds")).toBe("12");
    expect(offer?.creative?.durationSeconds).toBe(10);
  });

  it("rejects an out-of-range window before sending anything", async () => {
    const { fetch, calls } = fetchReturning({ offer: null });
    await expect(client(fetch).requestSponsoredOpportunity({ availableSeconds: -1 })).rejects.toBeInstanceOf(DevAdsError);
    expect(calls).toHaveLength(0);
  });
});
