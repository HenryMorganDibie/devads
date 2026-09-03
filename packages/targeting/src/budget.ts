import type { BudgetUsage, CampaignCandidate } from "./types";

/**
 * A campaign is budget-eligible if it either has no configured budget cap,
 * or its spend-to-date (daily and/or total) has not yet reached the cap.
 * One impression's cost is cpmCents/1000 (floored) minor units.
 */
export function hasBudgetRemaining(campaign: CampaignCandidate, usage: BudgetUsage): boolean {
  const impressionCostCents = Math.floor(campaign.cpmCents / 1000);
  if (
    campaign.dailyBudgetCents != null &&
    usage.spentTodayCents + impressionCostCents > campaign.dailyBudgetCents
  ) {
    return false;
  }
  if (
    campaign.totalBudgetCents != null &&
    usage.spentTotalCents + impressionCostCents > campaign.totalBudgetCents
  ) {
    return false;
  }
  return true;
}
