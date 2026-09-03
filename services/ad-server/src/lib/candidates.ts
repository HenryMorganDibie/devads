import { prisma } from "@devads/database";
import type { BudgetUsage, CampaignCandidate, ImpressionHistoryEntry } from "@devads/targeting";
import { config } from "./config.js";

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Loads APPROVED campaigns (with their first creative + targets) as pure targeting candidates. */
export async function loadCampaignCandidates(): Promise<
  Array<CampaignCandidate & { creativeId: string; campaignName: string }>
> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "APPROVED" },
    include: { targets: true, creatives: { take: 1, orderBy: { createdAt: "asc" } } },
  });

  return campaigns
    .filter((c) => c.creatives.length > 0)
    .map((c) => {
      const t = c.targets[0];
      return {
        campaignId: c.id,
        campaignName: c.name,
        creativeId: c.creatives[0].id,
        cpmCents: c.cpmCents,
        status: c.status,
        dailyBudgetCents: c.dailyBudgetCents,
        totalBudgetCents: c.totalBudgetCents,
        frequencyCapPerDay: config.frequencyCap.defaultDailyCapPerCampaign,
        target: t
          ? {
              languages: t.languages,
              frameworks: t.frameworks,
              runtimes: t.runtimes,
              platforms: t.platforms,
              countries: t.countries,
              categories: t.categories,
            }
          : { languages: [], frameworks: [], runtimes: [], platforms: [], countries: [], categories: [] },
      };
    });
}

export async function loadBudgetUsage(campaignIds: string[], now: Date): Promise<Record<string, BudgetUsage>> {
  if (campaignIds.length === 0) return {};
  const dayStart = startOfUtcDay(now);

  const [todayGrouped, totalGrouped] = await Promise.all([
    prisma.campaignSpend.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, createdAt: { gte: dayStart } },
      _sum: { amountCents: true },
    }),
    prisma.campaignSpend.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds } },
      _sum: { amountCents: true },
    }),
  ]);

  const usage: Record<string, BudgetUsage> = {};
  for (const id of campaignIds) usage[id] = { spentTodayCents: 0, spentTotalCents: 0 };
  for (const row of todayGrouped) usage[row.campaignId].spentTodayCents = row._sum.amountCents ?? 0;
  for (const row of totalGrouped) usage[row.campaignId].spentTotalCents = row._sum.amountCents ?? 0;
  return usage;
}

export async function loadImpressionHistory(developerId: string, now: Date): Promise<ImpressionHistoryEntry[]> {
  const dayStart = startOfUtcDay(now);
  const rows = await prisma.adImpression.findMany({
    where: { developerId, createdAt: { gte: dayStart } },
    select: { campaignId: true, createdAt: true },
  });
  return rows;
}
