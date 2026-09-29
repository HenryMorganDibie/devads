import { describe, expect, it, vi } from "vitest";
import {
  addSponsoredOffer,
  buildCreateCampaignPayload,
  canSubmit,
  createSponsorshipCampaign,
  dateInputToIso,
  emptyCampaignForm,
  fetchSponsorshipCampaign,
  fetchSponsorshipCampaigns,
  formatMoneyCents,
  formatUnits,
  isSponsorshipCampaign,
  parseMoneyToCents,
  parsePositiveInt,
  submitSponsorshipCampaign,
  summarizeSpend,
  validateOffer,
  type CampaignFormValues,
} from "../lib/sponsorships";
import { campaign, offer } from "./fixtures";

function filledForm(overrides: Partial<CampaignFormValues> = {}): CampaignFormValues {
  return {
    ...emptyCampaignForm(),
    name: "Launch credits",
    rewardAmountUnits: "500",
    sponsorCharge: "2.50",
    ...overrides,
  };
}

function getter(result: { ok: boolean; status: number; data: unknown } | Error) {
  return vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  }) as never;
}

describe("integer money and unit formatting", () => {
  it("formats cents from digits without floats", () => {
    expect(formatMoneyCents(123456)).toBe("$1,234.56");
    expect(formatMoneyCents(5)).toBe("$0.05");
    expect(formatMoneyCents(0)).toBe("$0.00");
    expect(formatMoneyCents(-250)).toBe("-$2.50");
    expect(formatMoneyCents(1500, "EUR")).toBe("EUR 15.00");
    // Would print 0.30000000000000004-style noise if it went through float math.
    expect(formatMoneyCents(30)).toBe("$0.30");
  });

  it("groups units", () => {
    expect(formatUnits(1240)).toBe("1,240");
    expect(formatUnits(-1000000)).toBe("-1,000,000");
  });

  it("parses money input to integer cents from digits", () => {
    expect(parseMoneyToCents("2.5")).toBe(250);
    expect(parseMoneyToCents("2.50")).toBe(250);
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("1,200")).toBe(120000);
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("-1")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
  });

  it("parses positive whole numbers only", () => {
    expect(parsePositiveInt("1,000")).toBe(1000);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("1.5")).toBeNull();
  });

  it("turns a date input into the start of that UTC day", () => {
    expect(dateInputToIso("2026-10-01")).toBe("2026-10-01T00:00:00.000Z");
    expect(dateInputToIso("2026-02-30")).toBeNull();
    expect(dateInputToIso("")).toBeNull();
  });
});

describe("buildCreateCampaignPayload", () => {
  it("builds a minimal body matching CreateSponsorshipCampaignSchema, omitting blank optionals", () => {
    const r = buildCreateCampaignPayload(filledForm(), "adv1");
    expect(r).toEqual({
      ok: true,
      payload: {
        advertiserId: "adv1",
        name: "Launch credits",
        objective: "PRODUCT_DISCOVERY",
        rewardType: "AI_CREDITS",
        rewardAmountUnits: 500,
        sponsorChargeCents: 250,
        currency: "USD",
        eligibleClientTypes: [],
      },
    });
  });

  it("treats the sponsor category as optional: blank is omitted, never required", () => {
    const blank = buildCreateCampaignPayload(filledForm({ sponsorCategory: "   " }), "adv1");
    expect(blank.ok).toBe(true);
    if (blank.ok) expect("sponsorCategory" in blank.payload).toBe(false);

    const given = buildCreateCampaignPayload(filledForm({ sponsorCategory: " Cloud tools " }), "adv1");
    expect(given.ok && given.payload.sponsorCategory).toBe("Cloud tools");
  });

  it("sends every optional field when filled, as integers", () => {
    const r = buildCreateCampaignPayload(
      filledForm({
        totalBudget: "1,000",
        dailyBudget: "50.5",
        developerDailyCap: "2",
        developerLifetimeCap: "10",
        frequencyCapPerDay: "3",
        eligibleClientTypes: ["CURSOR", "VS_CODE"],
        startDate: "2026-10-01",
        endDate: "2026-11-01",
        offer: { title: "Try it", description: "Do a thing", ctaUrl: "https://x.dev", requiredAction: "", expiresAt: "2026-10-15" },
      }),
      "adv1"
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({
      totalBudgetCents: 100000,
      dailyBudgetCents: 5050,
      developerDailyCap: 2,
      developerLifetimeCap: 10,
      frequencyCapPerDay: 3,
      // Canonical enum order, regardless of click order.
      eligibleClientTypes: ["VS_CODE", "CURSOR"],
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-11-01T00:00:00.000Z",
      offers: [{ title: "Try it", description: "Do a thing", ctaUrl: "https://x.dev", expiresAt: "2026-10-15T00:00:00.000Z" }],
    });
    expect(r.payload.offers?.[0]).not.toHaveProperty("requiredAction");
  });

  it("only sends fields that exist on the server schema", () => {
    const r = buildCreateCampaignPayload(filledForm({ totalBudget: "10" }), "adv1");
    if (!r.ok) throw new Error("expected ok");
    const allowed = new Set([
      "advertiserId", "name", "sponsorCategory", "objective", "rewardType", "rewardAmountUnits",
      "sponsorChargeCents", "currency", "totalBudgetCents", "dailyBudgetCents", "developerDailyCap",
      "developerLifetimeCap", "frequencyCapPerDay", "eligibleClientTypes", "startDate", "endDate", "offers",
    ]);
    for (const key of Object.keys(r.payload)) expect(allowed.has(key)).toBe(true);
  });

  it("allows a zero sponsor charge (schema is nonnegative) but not a zero reward (positive)", () => {
    expect(buildCreateCampaignPayload(filledForm({ sponsorCharge: "0" }), "adv1").ok).toBe(true);
    const r = buildCreateCampaignPayload(filledForm({ rewardAmountUnits: "0" }), "adv1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.rewardAmountUnits).toBeTruthy();
  });

  it("reports field errors instead of sending bad input", () => {
    const r = buildCreateCampaignPayload(
      filledForm({
        name: "",
        sponsorCharge: "2.555",
        totalBudget: "0",
        developerDailyCap: "1.5",
        startDate: "2026-11-01",
        endDate: "2026-10-01",
        sponsorCategory: "x".repeat(65),
      }),
      "adv1"
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["developerDailyCap", "endDate", "name", "sponsorCategory", "sponsorCharge", "totalBudget"].sort()
    );
  });

  it("validates a partially filled first offer", () => {
    const r = buildCreateCampaignPayload(filledForm({ offer: { ...emptyCampaignForm().offer, title: "Half" } }), "adv1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors["offer.description"]).toBeTruthy();
      expect(r.errors["offer.ctaUrl"]).toBeTruthy();
    }
  });
});

describe("validateOffer", () => {
  it("requires title, description and an http(s) link", () => {
    const r = validateOffer({ title: "", description: "", ctaUrl: "javascript:alert(1)", requiredAction: "", expiresAt: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["ctaUrl", "description", "title"]);
  });

  it("keeps a trimmed required action", () => {
    const r = validateOffer({ title: "T", description: "D", ctaUrl: "https://x.dev", requiredAction: " Create a project ", expiresAt: "" });
    expect(r).toEqual({ ok: true, payload: { title: "T", description: "D", ctaUrl: "https://x.dev", requiredAction: "Create a project" } });
  });
});

describe("derived views", () => {
  it("reconciles spend against rewarded completions with integer math", () => {
    const s = summarizeSpend({
      sponsorChargeCents: 250,
      totalBudgetCents: 1000,
      stats: { displays: 40, completions: 6, rewardsGranted: 5, spendCents: 1000 },
    });
    expect(s).toEqual({ spendCents: 1000, listPriceCents: 1250, unbilledCents: 250, remainingBudgetCents: 0 });
  });

  it("has no remaining budget without a total budget", () => {
    expect(
      summarizeSpend({ sponsorChargeCents: 100, totalBudgetCents: null, stats: { displays: 0, completions: 0, rewardsGranted: 0, spendCents: 0 } })
        .remainingBudgetCents
    ).toBeNull();
  });

  it("only lets a draft with an active offer be submitted", () => {
    expect(canSubmit(campaign())).toBe(false);
    expect(canSubmit(campaign({ offers: [offer] }))).toBe(true);
    expect(canSubmit(campaign({ offers: [{ ...offer, status: "INACTIVE" }] }))).toBe(false);
    expect(canSubmit(campaign({ status: "SUBMITTED", offers: [offer] }))).toBe(false);
  });
});

describe("isSponsorshipCampaign", () => {
  it("accepts a well-formed DTO, with or without stats", () => {
    expect(isSponsorshipCampaign(campaign({ offers: [offer] }))).toBe(true);
    expect(isSponsorshipCampaign({ ...campaign(), stats: undefined })).toBe(true);
  });

  it("rejects fractional money, unknown enums and missing fields", () => {
    expect(isSponsorshipCampaign(campaign({ sponsorChargeCents: 2.5 }))).toBe(false);
    expect(isSponsorshipCampaign({ ...campaign(), status: "LIVE" })).toBe(false);
    expect(isSponsorshipCampaign({ ...campaign(), eligibleClientTypes: ["EMACS"] })).toBe(false);
    const { name: _name, ...missing } = campaign();
    expect(isSponsorshipCampaign(missing)).toBe(false);
  });
});

describe("loaders and actions", () => {
  it("lists campaigns for the advertiser", async () => {
    const get = getter({ ok: true, status: 200, data: [campaign()] });
    const r = await fetchSponsorshipCampaigns("adv 1", get);
    expect(r).toEqual({ status: "ok", campaigns: [campaign()] });
    expect(get).toHaveBeenCalledWith("/api/v1/sponsorship-campaigns?advertiserId=adv%201");
  });

  it("maps 401 to unauthenticated and 403 to an access error", async () => {
    expect((await fetchSponsorshipCampaigns("adv1", getter({ ok: false, status: 401, data: {} }))).status).toBe("unauthenticated");
    const forbidden = await fetchSponsorshipCampaigns("adv1", getter({ ok: false, status: 403, data: {} }));
    expect(forbidden.status).toBe("error");
  });

  it("reports server, malformed and network failures as errors", async () => {
    expect((await fetchSponsorshipCampaigns("adv1", getter({ ok: false, status: 500, data: {} }))).status).toBe("error");
    const bad = await fetchSponsorshipCampaigns("adv1", getter({ ok: true, status: 200, data: [{ id: "x" }] }));
    expect(bad).toEqual({ status: "error", message: expect.stringContaining("format") });
    const net = await fetchSponsorshipCampaigns("adv1", getter(new Error("offline")));
    expect(net).toEqual({ status: "error", message: expect.stringContaining("reach DevAds") });
  });

  it("finds one campaign in the list, or reports not found", async () => {
    const get = getter({ ok: true, status: 200, data: [campaign(), campaign({ id: "sc2" })] });
    const found = await fetchSponsorshipCampaign("adv1", "sc2", get);
    expect(found.status === "ok" && found.campaign.id).toBe("sc2");
    expect(await fetchSponsorshipCampaign("adv1", "nope", get)).toEqual({ status: "not_found" });
  });

  it("creates, adds an offer and submits through the existing routes", async () => {
    const post = vi.fn(async () => ({ ok: true, status: 200, data: campaign({ offers: [offer] }) })) as never;
    const built = buildCreateCampaignPayload(filledForm(), "adv1");
    if (!built.ok) throw new Error("expected ok");
    expect((await createSponsorshipCampaign(built.payload, post)).status).toBe("ok");
    expect((await addSponsoredOffer("sc1", { title: "T", description: "D", ctaUrl: "https://x.dev" }, post)).status).toBe("ok");
    expect((await submitSponsorshipCampaign("sc1", post)).status).toBe("ok");
    const calls = (post as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "/api/v1/sponsorship-campaigns",
      "/api/v1/sponsorship-campaigns/sc1/offers",
      "/api/v1/sponsorship-campaigns/sc1/submit",
    ]);
  });

  it("explains known server refusals", async () => {
    const post = vi.fn(async () => ({ ok: false, status: 400, data: { error: "campaign_needs_at_least_one_offer" } })) as never;
    expect(await submitSponsorshipCampaign("sc1", post)).toEqual({
      status: "error",
      message: "Add at least one active offer before submitting for review.",
    });
    const suspended = vi.fn(async () => ({ ok: false, status: 403, data: { error: "advertiser_suspended" } })) as never;
    const r = await createSponsorshipCampaign({} as never, suspended);
    expect(r).toEqual({ status: "error", message: expect.stringContaining("suspended") });
  });
});
