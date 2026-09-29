import { prisma, type OfferCreative, type Prisma, type SponsoredOffer, type SponsorshipCampaign } from "@devads/database";
import type {
  BudgetUsage,
  DeveloperRewardCounts,
  ImpressionHistoryEntry,
  SponsorshipCandidate,
} from "@devads/targeting";

type Db = Prisma.TransactionClient | typeof prisma;

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Maps a campaign row + one of its offers to the pure targeting candidate shape. */
export function toSponsorshipCandidate(
  c: SponsorshipCampaign,
  offer: SponsoredOffer & { creatives?: OfferCreative[] }
): SponsorshipCandidate {
  return {
    campaignId: c.id,
    offerId: offer.id,
    status: c.status,
    sponsorCategory: c.sponsorCategory,
    sponsorChargeCents: c.sponsorChargeCents,
    rewardType: c.rewardType,
    rewardAmountUnits: c.rewardAmountUnits,
    eligibleClientTypes: c.eligibleClientTypes,
    startDate: c.startDate,
    endDate: c.endDate,
    offerExpiresAt: offer.expiresAt,
    offerActive: offer.status === "ACTIVE",
    dailyBudgetCents: c.dailyBudgetCents,
    totalBudgetCents: c.totalBudgetCents,
    developerDailyCap: c.developerDailyCap,
    developerLifetimeCap: c.developerLifetimeCap,
    frequencyCapPerDay: c.frequencyCapPerDay,
    mode: c.mode,
    presentationMode: offer.presentationMode,
    creatives: (offer.creatives ?? []).map((cr) => ({ id: cr.id, durationSeconds: cr.durationSeconds })),
  };
}

/**
 * An offer's CTA may contain the literal token {displayEventId}; it is
 * replaced with the server-issued display id so a landing page (such as the
 * DevAds beta walkthrough) can report interactions against this display.
 * The id is opaque and useless without the developer's own session.
 */
export function resolveCtaUrl(ctaUrl: string, displayEventId: string): string {
  return ctaUrl.split("{displayEventId}").join(encodeURIComponent(displayEventId));
}

/**
 * Loads APPROVED sponsorship campaigns with their oldest active, unexpired
 * offer as pure targeting candidates (analogue of loadCampaignCandidates).
 */
export async function loadSponsorshipCandidates(
  now: Date
): Promise<
  Array<SponsorshipCandidate & { offer: SponsoredOffer & { creatives: OfferCreative[] }; minEngagementSeconds: number | null }>
> {
  const campaigns = await prisma.sponsorshipCampaign.findMany({
    where: { status: "APPROVED" },
    include: {
      offers: {
        where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { createdAt: "asc" },
        take: 1,
        include: { creatives: { orderBy: { durationSeconds: "asc" } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return campaigns
    .filter((c) => c.offers.length > 0)
    .map((c) => ({
      ...toSponsorshipCandidate(c, c.offers[0]),
      offer: c.offers[0],
      minEngagementSeconds: c.minEngagementSeconds,
    }));
}

export async function loadSponsorshipBudgetUsage(
  campaignIds: string[],
  now: Date,
  db: Db = prisma
): Promise<Record<string, BudgetUsage>> {
  const usage: Record<string, BudgetUsage> = {};
  for (const id of campaignIds) usage[id] = { spentTodayCents: 0, spentTotalCents: 0 };
  if (campaignIds.length === 0) return usage;

  const [todayGrouped, totalGrouped] = await Promise.all([
    db.sponsorshipCampaignSpend.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds }, createdAt: { gte: startOfUtcDay(now) } },
      _sum: { amountCents: true },
    }),
    db.sponsorshipCampaignSpend.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds } },
      _sum: { amountCents: true },
    }),
  ]);
  for (const row of todayGrouped) usage[row.campaignId].spentTodayCents = row._sum.amountCents ?? 0;
  for (const row of totalGrouped) usage[row.campaignId].spentTotalCents = row._sum.amountCents ?? 0;
  return usage;
}

/** This developer's server-issued OFFER_DISPLAYED events today. */
export async function loadDisplayHistory(developerId: string, now: Date): Promise<ImpressionHistoryEntry[]> {
  return prisma.sponsorshipEvent.findMany({
    where: { developerId, type: "OFFER_DISPLAYED", createdAt: { gte: startOfUtcDay(now) } },
    select: { campaignId: true, createdAt: true },
  });
}

/**
 * Rewarded completions (EARNED ledger rows that are not rejected/reversed)
 * per campaign for this developer, today and lifetime.
 */
export async function loadRewardCounts(
  developerId: string,
  campaignIds: string[],
  now: Date,
  db: Db = prisma
): Promise<Record<string, DeveloperRewardCounts>> {
  const counts: Record<string, DeveloperRewardCounts> = {};
  for (const id of campaignIds) counts[id] = { earnedToday: 0, earnedLifetime: 0 };
  if (campaignIds.length === 0) return counts;

  const base = {
    developerId,
    campaignId: { in: campaignIds },
    entryType: "EARNED" as const,
    status: { in: ["PENDING", "APPROVED"] as Array<"PENDING" | "APPROVED"> },
  };
  const [today, lifetime] = await Promise.all([
    db.developerRewardLedger.groupBy({
      by: ["campaignId"],
      where: { ...base, createdAt: { gte: startOfUtcDay(now) } },
      _count: { _all: true },
    }),
    db.developerRewardLedger.groupBy({ by: ["campaignId"], where: base, _count: { _all: true } }),
  ]);
  // campaignId is nullable on the ledger (redemption rows), but EARNED rows
  // filtered by campaign always carry one.
  for (const row of today) if (row.campaignId) counts[row.campaignId].earnedToday = row._count._all;
  for (const row of lifetime) if (row.campaignId) counts[row.campaignId].earnedLifetime = row._count._all;
  return counts;
}
