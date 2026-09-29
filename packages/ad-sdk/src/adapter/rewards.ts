import type { RewardType, SponsoredOpportunity } from "../types.js";

const REWARD_LABELS: Record<RewardType, string> = {
  AI_CREDITS: "AI credits",
  API_CREDITS: "API credits",
  COMPUTE_CREDITS: "compute credits",
  TOOL_CREDITS: "tool credits",
  CASH: "cash",
  DISCOUNT: "discount",
  SUBSCRIPTION_CREDIT: "subscription credit",
  OTHER: "other reward",
  BETA_CREDITS: "DevAds beta credits",
};

export function rewardLabel(type: RewardType): string {
  return REWARD_LABELS[type] ?? "reward";
}

/** e.g. "50 units (AI credits)". Units are the server's opaque integer reward units. */
export function formatReward(type: RewardType, units: number): string {
  return `${units} ${units === 1 ? "unit" : "units"} (${rewardLabel(type)})`;
}

/**
 * Whether opening the sponsor link is, by itself, the offer's qualifying
 * action. When the sponsor stated a further required action (free text such
 * as "create a project"), a client cannot observe it without invasive
 * tracking, so the runtime reports OFFER_OPENED only and does not claim
 * completion. This is the protocol's default completion policy for every
 * adapter; the server still decides whether any reward is granted.
 */
export function canClaimCompletionOnOpen(offer: SponsoredOpportunity): boolean {
  return !offer.requiredAction || offer.requiredAction.trim().length === 0;
}
