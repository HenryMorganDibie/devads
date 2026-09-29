import { prisma } from "@devads/database";
import type { SponsorshipCampaignStatsDTO } from "@devads/shared";

/**
 * Whole-campaign totals for one SponsorshipCampaign. These are the exact
 * queries the sponsor list route (GET /api/v1/sponsorship-campaigns) has
 * computed since Phase 1, moved here unchanged so the admin list route
 * reports the same numbers from the same logic. Reads only.
 */
export async function loadSponsorshipCampaignStats(campaignId: string): Promise<SponsorshipCampaignStatsDTO> {
  const [displays, completions, rewardsGranted, spend] = await Promise.all([
    prisma.sponsorshipEvent.count({ where: { campaignId, type: "OFFER_DISPLAYED" } }),
    prisma.sponsorshipEvent.count({ where: { campaignId, type: "OFFER_COMPLETED" } }),
    prisma.developerRewardLedger.count({ where: { campaignId, entryType: "EARNED" } }),
    prisma.sponsorshipCampaignSpend.aggregate({ where: { campaignId }, _sum: { amountCents: true } }),
  ]);
  return { displays, completions, rewardsGranted, spendCents: spend._sum.amountCents ?? 0 };
}
