import { isFrequencyCapped } from "./frequencyCap.js";
import { applyTargeting } from "./matching.js";
import { hasBudgetRemaining } from "./budget.js";
import type {
  BudgetUsage,
  CampaignCandidate,
  CommandContext,
  DeveloperContext,
  DeveloperPrefs,
  FrequencyCapConfig,
  ImpressionHistoryEntry,
} from "./types";

export interface SelectAdInput {
  candidates: CampaignCandidate[];
  context: CommandContext;
  prefs: DeveloperPrefs;
  dev: DeveloperContext;
  history: ImpressionHistoryEntry[];
  budgetByCampaignId: Record<string, BudgetUsage>;
  frequencyCapConfig: FrequencyCapConfig;
  now?: Date;
}

/**
 * Pure composition of the full eligibility pipeline:
 * targeting match -> budget remaining -> frequency cap -> highest CPM wins.
 * No I/O; the ad-server is responsible for loading candidates/history/budget
 * from the database and persisting the resulting impression.
 */
export function selectAd(input: SelectAdInput): CampaignCandidate | null {
  const now = input.now ?? new Date();

  const targeted = applyTargeting(input.candidates, input.context, input.prefs);

  const budgeted = targeted.filter((c) => {
    const usage = input.budgetByCampaignId[c.campaignId] ?? { spentTodayCents: 0, spentTotalCents: 0 };
    return hasBudgetRemaining(c, usage);
  });

  const uncapped = budgeted.filter(
    (c) => !isFrequencyCapped(input.dev, c.campaignId, input.history, input.frequencyCapConfig, now)
  );

  if (uncapped.length === 0) return null;

  return uncapped.reduce((best, c) => (c.cpmCents > best.cpmCents ? c : best), uncapped[0]);
}
