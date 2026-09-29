import { describe, expect, it } from "vitest";
import { selectCreativeForWindow } from "../creativeSelection";
import { listEligibleSponsoredOffers, selectSponsoredOffer, type SponsorshipCandidate } from "../sponsorshipEligibility";

const creatives = [
  { id: "c20", durationSeconds: 20 },
  { id: "c10", durationSeconds: 10 },
  { id: "c15", durationSeconds: 15 },
];

describe("selectCreativeForWindow", () => {
  it("serves no video below the 10 second minimum or when the window is unknown", () => {
    for (const w of [undefined, NaN, 0, 5, 9]) expect(selectCreativeForWindow(creatives, w)).toBeNull();
  });

  it("serves the longest creative that fits: 10-14s -> 10s, 15-19s -> 15s, 20s+ -> 20s", () => {
    const pick = (w: number) => selectCreativeForWindow(creatives, w)?.durationSeconds;
    expect([10, 11, 14].map(pick)).toEqual([10, 10, 10]);
    expect([15, 16, 19].map(pick)).toEqual([15, 15, 15]);
    expect([20, 45, 3600].map(pick)).toEqual([20, 20, 20]);
  });

  it("never returns a creative longer than the window", () => {
    for (let w = 0; w <= 40; w++) {
      const c = selectCreativeForWindow(creatives, w);
      if (c) expect(c.durationSeconds).toBeLessThanOrEqual(w);
    }
  });

  it("returns null when every creative is longer than the window", () => {
    expect(selectCreativeForWindow([{ id: "c30", durationSeconds: 30 }], 20)).toBeNull();
  });

  it("ignores malformed durations", () => {
    expect(selectCreativeForWindow([{ id: "x", durationSeconds: 0 }, { id: "y", durationSeconds: 12.5 }], 20)).toBeNull();
  });
});

describe("VIDEO offers in selection", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const base: SponsorshipCandidate = {
    campaignId: "video",
    offerId: "video-offer",
    status: "APPROVED",
    sponsorCategory: null,
    sponsorChargeCents: 10,
    rewardType: "BETA_CREDITS",
    rewardAmountUnits: 25,
    eligibleClientTypes: [],
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: null,
    offerExpiresAt: null,
    offerActive: true,
    dailyBudgetCents: null,
    totalBudgetCents: null,
    developerDailyCap: null,
    developerLifetimeCap: null,
    frequencyCapPerDay: null,
    mode: "BETA",
    presentationMode: "VIDEO",
    creatives,
  };
  const select = (availableWaitSeconds: number | undefined, candidates = [base]) =>
    selectSponsoredOffer({
      candidates,
      dev: { developerId: "d", enabled: true, clientType: "VS_CODE", betaMember: true, availableWaitSeconds },
      displayHistory: [],
      budgetByCampaignId: {},
      rewardCountsByCampaignId: {},
      defaultFrequencyCapPerDay: 10,
      now,
    });

  it("is only eligible when a creative fits the reported window", () => {
    expect(select(undefined)).toBeNull();
    expect(select(9)).toBeNull();
    expect(select(10)?.offerId).toBe("video-offer");
  });

  it("yields to a CARD offer when no creative fits", () => {
    const card = { ...base, campaignId: "card", offerId: "card-offer", presentationMode: "CARD" as const, creatives: [] };
    expect(select(5, [base, card])?.offerId).toBe("card-offer");
  });

  it("stays browsable in the read-only listing, which is not a display", () => {
    const listed = listEligibleSponsoredOffers({
      candidates: [base],
      dev: { developerId: "d", enabled: true, clientType: "VS_CODE", betaMember: true },
      budgetByCampaignId: {},
      rewardCountsByCampaignId: {},
      now,
    });
    expect(listed).toHaveLength(1);
  });
});

describe("tie-breaking between equally priced offers", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const mk = (id: string, presentationMode: "CARD" | "VIDEO"): SponsorshipCandidate => ({
    campaignId: id,
    offerId: `${id}-offer`,
    status: "APPROVED",
    sponsorCategory: null,
    sponsorChargeCents: 1,
    rewardType: "BETA_CREDITS",
    rewardAmountUnits: 25,
    eligibleClientTypes: [],
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: null,
    offerExpiresAt: null,
    offerActive: true,
    dailyBudgetCents: null,
    totalBudgetCents: null,
    developerDailyCap: null,
    developerLifetimeCap: null,
    frequencyCapPerDay: null,
    mode: "BETA",
    presentationMode,
    creatives: presentationMode === "VIDEO" ? [{ id: `${id}-10`, durationSeconds: 10 }] : [],
  });
  const pick = (candidates: SponsorshipCandidate[], window: number | undefined, history: Array<{ campaignId: string; createdAt: Date }> = []) =>
    selectSponsoredOffer({
      candidates,
      dev: { developerId: "d", enabled: true, clientType: "VS_CODE", betaMember: true, availableWaitSeconds: window },
      displayHistory: history,
      budgetByCampaignId: {},
      rewardCountsByCampaignId: {},
      defaultFrequencyCapPerDay: 10,
      now,
    })?.campaignId;

  it("prefers a fitting video over a card at the same price, and the card without a window", () => {
    expect(pick([mk("card", "CARD"), mk("video", "VIDEO")], 12)).toBe("video");
    expect(pick([mk("card", "CARD"), mk("video", "VIDEO")], undefined)).toBe("card");
  });

  it("rotates equal offers by how often each was shown to the developer today", () => {
    const history = [{ campaignId: "a", createdAt: now }];
    expect(pick([mk("a", "VIDEO"), mk("b", "VIDEO")], 12)).toBe("a");
    expect(pick([mk("a", "VIDEO"), mk("b", "VIDEO")], 12, history)).toBe("b");
  });

  it("never lets a tie-break beat a higher sponsor charge", () => {
    const pricier = { ...mk("card", "CARD"), sponsorChargeCents: 5 };
    expect(pick([mk("video", "VIDEO"), pricier], 20)).toBe("card");
  });
});
