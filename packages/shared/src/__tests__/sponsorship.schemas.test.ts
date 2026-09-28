import { describe, expect, it } from "vitest";
import {
  CreateSponsorshipCampaignSchema,
  RewardTypeSchema,
  SponsorshipEventRequestSchema,
  StartDevelopmentSessionSchema,
  UpdateSponsorshipCampaignSchema,
} from "../sponsorship.js";

const baseCampaign = {
  advertiserId: "adv_1",
  name: "Try our tool",
  objective: "PRODUCT_DISCOVERY",
  rewardType: "TOOL_CREDITS",
  rewardAmountUnits: 100,
  sponsorChargeCents: 250,
};

describe("sponsorship schemas", () => {
  it("accepts a campaign with no sponsorCategory at all", () => {
    const result = CreateSponsorshipCampaignSchema.parse(baseCampaign);
    expect(result.sponsorCategory).toBeUndefined();
    expect(result.eligibleClientTypes).toEqual([]);
    expect(result.currency).toBe("USD");
  });

  it("accepts any free-form sponsorCategory string (no hard-coded list)", () => {
    for (const sponsorCategory of ["ai-lab", "database vendor", "x"]) {
      expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, sponsorCategory }).success).toBe(true);
    }
  });

  it("accepts every reward type with every objective (independent dimensions)", () => {
    for (const rewardType of RewardTypeSchema.options) {
      for (const objective of ["AWARENESS", "QUALIFIED_ENGAGEMENT", "PRODUCT_DISCOVERY", "TRIAL_ACTIVATION", "OTHER"]) {
        expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, rewardType, objective }).success).toBe(true);
      }
    }
  });

  it("rejects non-integer money and reward amounts", () => {
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, sponsorChargeCents: 1.5 }).success).toBe(false);
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, rewardAmountUnits: 0.5 }).success).toBe(false);
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, rewardAmountUnits: 0 }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const r = CreateSponsorshipCampaignSchema.safeParse({
      ...baseCampaign,
      startDate: "2026-10-02T00:00:00Z",
      endDate: "2026-10-01T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("partial updates do not silently reset eligibleClientTypes", () => {
    expect(UpdateSponsorshipCampaignSchema.parse({ name: "x" }).eligibleClientTypes).toBeUndefined();
  });

  it("strips client-supplied reward amounts from event requests", () => {
    const parsed = SponsorshipEventRequestSchema.parse({
      eventId: "e1",
      type: "OFFER_COMPLETED",
      displayEventId: "d1",
      rewardAmountUnits: 999999,
    });
    expect("rewardAmountUnits" in parsed).toBe(false);
  });

  it("does not let clients report server-authoritative event types", () => {
    expect(
      SponsorshipEventRequestSchema.safeParse({ eventId: "e1", type: "OFFER_DISPLAYED", displayEventId: "d1" }).success
    ).toBe(false);
  });

  it("only accepts a coarse activity category", () => {
    expect(StartDevelopmentSessionSchema.safeParse({ clientType: "AIDER", activityCategory: "build" }).success).toBe(true);
    expect(
      StartDevelopmentSessionSchema.safeParse({ clientType: "AIDER", activityCategory: "refactor src/secret.ts" }).success
    ).toBe(false);
  });
});
