import { describe, expect, it } from "vitest";
import { isEligible } from "../eligibility";
import { selectAd } from "../select";
import type { CampaignCandidate, CommandContext, DeveloperContext, DeveloperPrefs, FrequencyCapConfig } from "../types";

const baseTarget = {
  languages: [],
  frameworks: [],
  runtimes: [],
  platforms: [],
  countries: [],
  categories: [],
};

function campaign(overrides: Partial<CampaignCandidate>): CampaignCandidate {
  return {
    campaignId: "camp_1",
    creativeId: "cr_1",
    cpmCents: 1000,
    status: "APPROVED",
    target: baseTarget,
    dailyBudgetCents: null,
    totalBudgetCents: null,
    frequencyCapPerDay: 3,
    ...overrides,
  };
}

const prefs: DeveloperPrefs = { enabled: true };
const dev: DeveloperContext = { developerId: "dev_1" };
const capConfig: FrequencyCapConfig = { defaultDailyCapPerCampaign: 3, defaultDailyCapGlobal: 10 };
const ctx: CommandContext = { command: "npm run build" };

describe("isEligible", () => {
  it("requires opted-in developer and elapsed >= threshold", () => {
    expect(isEligible("npm run build", { enabled: true }, 15, 20)).toBe(true);
    expect(isEligible("npm run build", { enabled: true }, 15, 5)).toBe(false);
    expect(isEligible("npm run build", { enabled: false }, 15, 20)).toBe(false);
  });

  it("rejects an empty command", () => {
    expect(isEligible("", { enabled: true }, 15, 20)).toBe(false);
  });
});

describe("selectAd", () => {
  it("returns null when there are no candidates", () => {
    expect(
      selectAd({
        candidates: [],
        context: ctx,
        prefs,
        dev,
        history: [],
        budgetByCampaignId: {},
        frequencyCapConfig: capConfig,
      })
    ).toBeNull();
  });

  it("picks the highest-CPM approved, targeted, budgeted, uncapped campaign", () => {
    const low = campaign({ campaignId: "low", cpmCents: 500 });
    const high = campaign({ campaignId: "high", cpmCents: 2000 });
    const result = selectAd({
      candidates: [low, high],
      context: ctx,
      prefs,
      dev,
      history: [],
      budgetByCampaignId: {},
      frequencyCapConfig: capConfig,
    });
    expect(result?.campaignId).toBe("high");
  });

  it("excludes non-approved campaigns", () => {
    const draft = campaign({ campaignId: "draft", status: "DRAFT", cpmCents: 5000 });
    const result = selectAd({
      candidates: [draft],
      context: ctx,
      prefs,
      dev,
      history: [],
      budgetByCampaignId: {},
      frequencyCapConfig: capConfig,
    });
    expect(result).toBeNull();
  });

  it("excludes campaigns with no daily budget remaining", () => {
    const c = campaign({ campaignId: "tight", dailyBudgetCents: 0 });
    const result = selectAd({
      candidates: [c],
      context: ctx,
      prefs,
      dev,
      history: [],
      budgetByCampaignId: { tight: { spentTodayCents: 0, spentTotalCents: 0 } },
      frequencyCapConfig: capConfig,
    });
    expect(result).toBeNull();
  });

  it("excludes campaigns that hit today's frequency cap for this developer", () => {
    const c = campaign({ campaignId: "capped", frequencyCapPerDay: 1 });
    const now = new Date();
    const result = selectAd({
      candidates: [c],
      context: ctx,
      prefs,
      dev,
      history: [{ campaignId: "capped", createdAt: now }],
      budgetByCampaignId: {},
      frequencyCapConfig: { defaultDailyCapPerCampaign: 1, defaultDailyCapGlobal: 10 },
      now,
    });
    expect(result).toBeNull();
  });

  it("excludes campaigns whose targeting does not match the command context", () => {
    const c = campaign({
      campaignId: "rust-only",
      target: { ...baseTarget, languages: ["rust"] },
    });
    const result = selectAd({
      candidates: [c],
      context: { ...ctx, language: "typescript" },
      prefs,
      dev,
      history: [],
      budgetByCampaignId: {},
      frequencyCapConfig: capConfig,
    });
    expect(result).toBeNull();
  });
});
