import { describe, expect, it } from "vitest";
import {
  AdminActivityPageQuerySchema,
  AdminSponsorshipCampaignDTOSchema,
  AdminSponsorshipEventsPageSchema,
  AdminSponsorshipEventsQuerySchema,
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

  it("accepts every sponsor-grantable reward type with every objective (independent dimensions)", () => {
    for (const rewardType of RewardTypeSchema.options.filter((t) => t !== "BETA_CREDITS")) {
      for (const objective of ["AWARENESS", "QUALIFIED_ENGAGEMENT", "PRODUCT_DISCOVERY", "TRIAL_ACTIVATION", "OTHER"]) {
        expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, rewardType, objective }).success).toBe(true);
      }
    }
  });

  it("never lets a sponsor grant DevAds beta credits or create a BETA campaign", () => {
    const create = CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, rewardType: "BETA_CREDITS" });
    expect(create.success).toBe(false);
    expect(UpdateSponsorshipCampaignSchema.safeParse({ rewardType: "BETA_CREDITS" }).success).toBe(false);

    // `mode` is not a sponsor input: it is stripped, so the campaign stays LIVE.
    const withMode = CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, mode: "BETA" });
    expect(withMode.success).toBe(true);
    expect(withMode.success && "mode" in withMode.data).toBe(false);
  });

  it("bounds the minimum engagement time", () => {
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, minEngagementSeconds: 10 }).success).toBe(true);
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, minEngagementSeconds: -1 }).success).toBe(false);
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, minEngagementSeconds: 3601 }).success).toBe(false);
    expect(CreateSponsorshipCampaignSchema.safeParse({ ...baseCampaign, minEngagementSeconds: 1.5 }).success).toBe(false);
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

  it("admin activity paging: default limit, bounds, coerced query strings", () => {
    expect(AdminActivityPageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(AdminActivityPageQuerySchema.parse({ limit: "200", cursor: "abc" })).toEqual({ limit: 200, cursor: "abc" });
    expect(AdminActivityPageQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(AdminActivityPageQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(AdminSponsorshipEventsQuerySchema.safeParse({ type: "OFFER_COMPLETED" }).success).toBe(true);
    expect(AdminSponsorshipEventsQuerySchema.safeParse({ type: "NOPE" }).success).toBe(false);
  });

  it("admin event rows keep no metadata and admin campaigns require name + stats", () => {
    const page = AdminSponsorshipEventsPageSchema.parse({
      items: [
        {
          eventId: "e1",
          type: "OFFER_COMPLETED",
          offerId: "o1",
          developerId: "d1",
          sessionId: null,
          displayEventId: "disp1",
          createdAt: "2026-09-29T00:00:00.000Z",
          metadata: { secret: "x" },
        },
      ],
      nextCursor: null,
    });
    expect("metadata" in page.items[0]).toBe(false);
    expect(AdminSponsorshipCampaignDTOSchema.shape.advertiserName.safeParse(undefined).success).toBe(false);
    expect(AdminSponsorshipCampaignDTOSchema.shape.stats.safeParse(undefined).success).toBe(false);
  });
});