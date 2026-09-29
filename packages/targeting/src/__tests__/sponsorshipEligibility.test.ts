import { describe, expect, it } from "vitest";
import {
  developerRewardCapReached,
  isClientTypeEligible,
  isDeveloperEligibleForSponsorship,
  isSponsorshipLive,
  listEligibleSponsoredOffers,
  selectSponsoredOffer,
  wouldExceedSponsorshipBudget,
  type ListEligibleSponsoredOffersInput,
  type SelectSponsoredOfferInput,
  type SponsorshipCandidate,
} from "../sponsorshipEligibility";

const now = new Date("2026-09-29T12:00:00Z");

function candidate(overrides: Partial<SponsorshipCandidate> = {}): SponsorshipCandidate {
  return {
    campaignId: "sc_1",
    offerId: "offer_1",
    status: "APPROVED",
    sponsorCategory: null,
    sponsorChargeCents: 100,
    rewardType: "AI_CREDITS",
    rewardAmountUnits: 50,
    eligibleClientTypes: [],
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: null,
    offerExpiresAt: null,
    offerActive: true,
    dailyBudgetCents: null,
    totalBudgetCents: null,
    developerDailyCap: null,
    developerLifetimeCap: null,
    frequencyCapPerDay: null,
    ...overrides,
  };
}

function input(overrides: Partial<SelectSponsoredOfferInput> = {}): SelectSponsoredOfferInput {
  return {
    candidates: [candidate()],
    dev: { developerId: "dev_1", enabled: true, clientType: "CLAUDE_CODE" },
    displayHistory: [],
    budgetByCampaignId: {},
    rewardCountsByCampaignId: {},
    defaultFrequencyCapPerDay: 5,
    now,
    ...overrides,
  };
}

describe("isClientTypeEligible", () => {
  it("treats an empty eligible list as all clients", () => {
    expect(isClientTypeEligible([], "AIDER")).toBe(true);
  });
  it("restricts to the configured client types", () => {
    expect(isClientTypeEligible(["VS_CODE"], "VS_CODE")).toBe(true);
    expect(isClientTypeEligible(["VS_CODE"], "CODEX")).toBe(false);
  });
});

describe("isSponsorshipLive", () => {
  it("requires APPROVED status", () => {
    expect(isSponsorshipLive(candidate({ status: "PAUSED" }), now)).toBe(false);
    expect(isSponsorshipLive(candidate({ status: "SUBMITTED" }), now)).toBe(false);
  });
  it("respects the campaign date window and offer expiry", () => {
    expect(isSponsorshipLive(candidate({ startDate: new Date("2026-10-01T00:00:00Z") }), now)).toBe(false);
    expect(isSponsorshipLive(candidate({ endDate: new Date("2026-09-29T11:00:00Z") }), now)).toBe(false);
    expect(isSponsorshipLive(candidate({ offerExpiresAt: new Date("2026-09-29T11:59:59Z") }), now)).toBe(false);
    expect(isSponsorshipLive(candidate({ offerActive: false }), now)).toBe(false);
    expect(isSponsorshipLive(candidate(), now)).toBe(true);
  });
});

describe("isDeveloperEligibleForSponsorship", () => {
  const dev = { developerId: "d", enabled: true, clientType: "GEMINI", categoriesOptOut: ["crypto"] };
  it("excludes developers who have opted out of sponsored content", () => {
    expect(isDeveloperEligibleForSponsorship(candidate(), { ...dev, enabled: false })).toBe(false);
  });
  it("never excludes a campaign with no sponsor category", () => {
    expect(isDeveloperEligibleForSponsorship(candidate({ sponsorCategory: null }), dev)).toBe(true);
  });
  it("only compares a sponsor category against the developer's own opt-outs", () => {
    expect(isDeveloperEligibleForSponsorship(candidate({ sponsorCategory: "Crypto" }), dev)).toBe(false);
    expect(isDeveloperEligibleForSponsorship(candidate({ sponsorCategory: "any-arbitrary-value" }), dev)).toBe(true);
  });
});

describe("wouldExceedSponsorshipBudget", () => {
  it("has no limit when no budget is configured", () => {
    expect(wouldExceedSponsorshipBudget(candidate(), { spentTodayCents: 1e9, spentTotalCents: 1e9 }, 100)).toBe(false);
  });
  it("checks daily and total budgets independently", () => {
    const c = candidate({ dailyBudgetCents: 250, totalBudgetCents: 1000 });
    expect(wouldExceedSponsorshipBudget(c, { spentTodayCents: 200, spentTotalCents: 200 }, 100)).toBe(true);
    expect(wouldExceedSponsorshipBudget(c, { spentTodayCents: 100, spentTotalCents: 950 }, 100)).toBe(true);
    expect(wouldExceedSponsorshipBudget(c, { spentTodayCents: 100, spentTotalCents: 100 }, 100)).toBe(false);
  });
});

describe("developerRewardCapReached", () => {
  it("reports the daily and lifetime caps", () => {
    const c = candidate({ developerDailyCap: 2, developerLifetimeCap: 5 });
    expect(developerRewardCapReached(c, { earnedToday: 1, earnedLifetime: 1 })).toBeNull();
    expect(developerRewardCapReached(c, { earnedToday: 2, earnedLifetime: 2 })).toBe("DAILY");
    expect(developerRewardCapReached(c, { earnedToday: 0, earnedLifetime: 5 })).toBe("LIFETIME");
  });
});

describe("selectSponsoredOffer", () => {
  it("returns null when there are no candidates", () => {
    expect(selectSponsoredOffer(input({ candidates: [] }))).toBeNull();
  });

  it("picks the highest sponsor charge among eligible candidates", () => {
    const low = candidate({ campaignId: "low", offerId: "o_low", sponsorChargeCents: 50 });
    const high = candidate({ campaignId: "high", offerId: "o_high", sponsorChargeCents: 500 });
    expect(selectSponsoredOffer(input({ candidates: [low, high] }))?.offerId).toBe("o_high");
  });

  it("excludes campaigns restricted to other client types", () => {
    const c = candidate({ eligibleClientTypes: ["VS_CODE"] });
    expect(selectSponsoredOffer(input({ candidates: [c] }))).toBeNull();
  });

  it("excludes campaigns whose next charge would exceed budget", () => {
    const c = candidate({ dailyBudgetCents: 150 });
    const result = selectSponsoredOffer(
      input({ candidates: [c], budgetByCampaignId: { sc_1: { spentTodayCents: 100, spentTotalCents: 100 } } })
    );
    expect(result).toBeNull();
  });

  it("excludes campaigns where the developer hit a reward cap", () => {
    const c = candidate({ developerDailyCap: 1 });
    const result = selectSponsoredOffer(
      input({ candidates: [c], rewardCountsByCampaignId: { sc_1: { earnedToday: 1, earnedLifetime: 1 } } })
    );
    expect(result).toBeNull();
  });

  it("applies the display frequency cap (campaign override, else platform default)", () => {
    const history = [{ campaignId: "sc_1", createdAt: now }];
    expect(selectSponsoredOffer(input({ candidates: [candidate({ frequencyCapPerDay: 1 })], displayHistory: history }))).toBeNull();
    expect(
      selectSponsoredOffer(input({ candidates: [candidate()], displayHistory: history, defaultFrequencyCapPerDay: 1 }))
    ).toBeNull();
    expect(selectSponsoredOffer(input({ candidates: [candidate()], displayHistory: history }))).not.toBeNull();
  });

  it("is independent of sponsor category and reward type values", () => {
    const rewardTypes = ["AI_CREDITS", "API_CREDITS", "COMPUTE_CREDITS", "TOOL_CREDITS", "CASH", "DISCOUNT", "SUBSCRIPTION_CREDIT", "OTHER"];
    const categories = [null, "", "anything", "some-sponsor-defined-label"];
    for (const rewardType of rewardTypes) {
      for (const sponsorCategory of categories) {
        const result = selectSponsoredOffer(input({ candidates: [candidate({ rewardType, sponsorCategory })] }));
        expect(result?.rewardType).toBe(rewardType);
      }
    }
  });
});

describe("listEligibleSponsoredOffers", () => {
  function list(overrides: Partial<ListEligibleSponsoredOffersInput> = {}) {
    return listEligibleSponsoredOffers({
      candidates: [candidate()],
      dev: { developerId: "dev_1", enabled: true },
      budgetByCampaignId: {},
      rewardCountsByCampaignId: {},
      now,
      ...overrides,
    });
  }

  it("returns every eligible candidate in the caller's order, not a single winner", () => {
    const a = candidate({ campaignId: "a", offerId: "o_a", sponsorChargeCents: 50 });
    const b = candidate({ campaignId: "b", offerId: "o_b", sponsorChargeCents: 500 });
    expect(list({ candidates: [a, b] }).map((c) => c.offerId)).toEqual(["o_a", "o_b"]);
  });

  it("drops non-live, budget-exhausted and reward-capped candidates", () => {
    const candidates = [
      candidate({ campaignId: "live", offerId: "o_live" }),
      candidate({ campaignId: "paused", status: "PAUSED" }),
      candidate({ campaignId: "ended", endDate: new Date("2026-09-29T11:00:00Z") }),
      candidate({ campaignId: "expired", offerExpiresAt: new Date("2026-09-29T11:00:00Z") }),
      candidate({ campaignId: "broke", totalBudgetCents: 150 }),
      candidate({ campaignId: "capped", developerLifetimeCap: 1 }),
    ];
    const result = list({
      candidates,
      budgetByCampaignId: { broke: { spentTodayCents: 100, spentTotalCents: 100 } },
      rewardCountsByCampaignId: { capped: { earnedToday: 0, earnedLifetime: 1 } },
    });
    expect(result.map((c) => c.campaignId)).toEqual(["live"]);
  });

  it("returns nothing for a developer who has opted out, and honours category opt-outs", () => {
    expect(list({ dev: { developerId: "dev_1", enabled: false } })).toEqual([]);
    const c = candidate({ sponsorCategory: "Crypto" });
    expect(list({ candidates: [c], dev: { developerId: "dev_1", enabled: true, categoriesOptOut: ["crypto"] } })).toEqual([]);
  });

  it("filters by client type only when one is given", () => {
    const vscodeOnly = candidate({ campaignId: "v", eligibleClientTypes: ["VS_CODE"] });
    const anyClient = candidate({ campaignId: "any" });
    expect(list({ candidates: [vscodeOnly, anyClient] }).map((c) => c.campaignId)).toEqual(["v", "any"]);
    expect(
      list({ candidates: [vscodeOnly, anyClient], dev: { developerId: "dev_1", enabled: true, clientType: "CODEX" } }).map(
        (c) => c.campaignId
      )
    ).toEqual(["any"]);
  });

  it("does not apply the display frequency cap (a listing is not a display)", () => {
    // frequencyCapPerDay of 1 would block selection after one display; the
    // listing has no display history input at all and still lists it.
    expect(list({ candidates: [candidate({ frequencyCapPerDay: 1 })] })).toHaveLength(1);
  });
});
