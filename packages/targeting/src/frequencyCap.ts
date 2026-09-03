import type { DeveloperContext, FrequencyCapConfig, ImpressionHistoryEntry } from "./types";

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function countImpressionsToday(
  history: ImpressionHistoryEntry[],
  now: Date,
  campaignId?: string
): number {
  return history.filter(
    (h) => isSameUtcDay(h.createdAt, now) && (campaignId === undefined || h.campaignId === campaignId)
  ).length;
}

/**
 * Returns true if showing another impression of `campaignId` to this
 * developer right now would violate either the per-campaign daily cap or
 * the developer's global daily cap.
 */
export function isFrequencyCapped(
  dev: DeveloperContext,
  campaignId: string,
  history: ImpressionHistoryEntry[],
  config: FrequencyCapConfig,
  now: Date = new Date()
): boolean {
  const perCampaignCap = dev.frequencyCapOverride ?? config.defaultDailyCapPerCampaign;
  const campaignCountToday = countImpressionsToday(history, now, campaignId);
  if (campaignCountToday >= perCampaignCap) return true;

  const globalCountToday = countImpressionsToday(history, now);
  if (globalCountToday >= config.defaultDailyCapGlobal) return true;

  return false;
}
