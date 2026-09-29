import type { SponsoredOffer, SponsorshipCampaign } from "../lib/sponsorships";

export const offer: SponsoredOffer = {
  id: "o1",
  title: "Try the SDK",
  description: "Build a demo app",
  ctaUrl: "https://example.com/start",
  requiredAction: null,
  expiresAt: null,
  status: "ACTIVE",
};

export function campaign(overrides: Partial<SponsorshipCampaign> = {}): SponsorshipCampaign {
  return {
    id: "sc1",
    advertiserId: "adv1",
    name: "Launch credits",
    sponsorCategory: null,
    objective: "PRODUCT_DISCOVERY",
    rewardType: "AI_CREDITS",
    rewardAmountUnits: 500,
    sponsorChargeCents: 250,
    currency: "USD",
    totalBudgetCents: 100000,
    dailyBudgetCents: null,
    developerDailyCap: 1,
    developerLifetimeCap: null,
    frequencyCapPerDay: null,
    eligibleClientTypes: [],
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: null,
    status: "DRAFT",
    rejectionReason: null,
    submittedAt: null,
    approvedAt: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    offers: [],
    stats: { displays: 0, completions: 0, rewardsGranted: 0, spendCents: 0 },
    ...overrides,
  };
}

/** Markup with tags stripped and whitespace collapsed, for text assertions. */
export function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
