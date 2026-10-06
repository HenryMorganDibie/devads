import { selectCreativeForWindow, type CreativeOption } from "./creativeSelection.js";
import { countImpressionsToday } from "./frequencyCap.js";
import type { BudgetUsage, ImpressionHistoryEntry } from "./types.js";

/**
 * Pure, side-effect-free eligibility + selection for sponsored offers.
 *
 * Deliberately parallel to select.ts (targeting -> budget -> frequency cap
 * -> ranking) but operating on the sponsorship domain. Nothing here knows
 * about any specific sponsor, sponsor category, reward type or client:
 * client types, categories and reward types are opaque strings/values that
 * only get compared for equality against what the campaign configured.
 *
 * The ad-server loads candidates/usage/history from the database, calls
 * these functions, and persists the result. The same functions are reused
 * inside the completion transaction so selection-time and reward-time rules
 * can never drift apart.
 */

export type SponsorshipCampaignStatusValue =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "ARCHIVED";

export interface SponsorshipCandidate {
  campaignId: string;
  offerId: string;
  status: SponsorshipCampaignStatusValue;
  /** Optional and purely descriptive; null is always valid. */
  sponsorCategory: string | null;
  sponsorChargeCents: number;
  rewardType: string;
  rewardAmountUnits: number;
  /** Empty = every client type is eligible. */
  eligibleClientTypes: string[];
  startDate: Date;
  endDate: Date | null;
  offerExpiresAt: Date | null;
  offerActive: boolean;
  dailyBudgetCents: number | null;
  totalBudgetCents: number | null;
  developerDailyCap: number | null;
  developerLifetimeCap: number | null;
  /** Max displays per developer per UTC day; null = use the platform default. */
  frequencyCapPerDay: number | null;
  /** LIVE (sponsor-funded, the default) or BETA (DevAds-funded developer beta). */
  mode?: "LIVE" | "BETA";
  /** CARD (default) or VIDEO. A VIDEO offer is only eligible when one of its creatives fits the available seconds. */
  presentationMode?: "CARD" | "VIDEO";
  /** VIDEO offers: the creatives available for this offer. */
  creatives?: CreativeOption[];
}

export interface SponsorshipDeveloperContext {
  developerId: string;
  /** Developer's persisted opt-in to sponsored content. */
  enabled: boolean;
  clientType: string;
  categoriesOptOut?: string[];
  /** Developer has joined the developer beta; BETA campaigns only serve members. */
  betaMember?: boolean;
  /**
   * Seconds the client's qualifying interaction reports as available for
   * presentation; required for VIDEO offers. Absent for interactions that
   * have no time window (for example a developer-initiated request).
   */
  availableSeconds?: number;
}

/** Rewarded (EARNED) completions for this developer, per campaign. */
export interface DeveloperRewardCounts {
  earnedToday: number;
  earnedLifetime: number;
}

export interface SelectSponsoredOfferInput {
  candidates: SponsorshipCandidate[];
  dev: SponsorshipDeveloperContext;
  /** This developer's OFFER_DISPLAYED history for today (campaignId + createdAt). */
  displayHistory: ImpressionHistoryEntry[];
  budgetByCampaignId: Record<string, BudgetUsage>;
  rewardCountsByCampaignId: Record<string, DeveloperRewardCounts>;
  defaultFrequencyCapPerDay: number;
  now?: Date;
}

/** Empty eligible list = all clients. Comparison is exact on the enum value. */
export function isClientTypeEligible(eligibleClientTypes: string[], clientType: string): boolean {
  if (eligibleClientTypes.length === 0) return true;
  return eligibleClientTypes.includes(clientType);
}

export type SponsorshipNotLiveReason =
  | "CAMPAIGN_NOT_APPROVED"
  | "CAMPAIGN_NOT_STARTED"
  | "CAMPAIGN_ENDED"
  | "OFFER_INACTIVE"
  | "OFFER_EXPIRED";

type LivenessFields = Pick<SponsorshipCandidate, "status" | "startDate" | "endDate" | "offerExpiresAt" | "offerActive">;

/** Why a campaign/offer cannot currently be shown or rewarded, or null if it can. */
export function sponsorshipNotLiveReason(c: LivenessFields, now: Date): SponsorshipNotLiveReason | null {
  if (c.status !== "APPROVED") return "CAMPAIGN_NOT_APPROVED";
  if (c.startDate.getTime() > now.getTime()) return "CAMPAIGN_NOT_STARTED";
  if (c.endDate && c.endDate.getTime() <= now.getTime()) return "CAMPAIGN_ENDED";
  if (!c.offerActive) return "OFFER_INACTIVE";
  if (c.offerExpiresAt && c.offerExpiresAt.getTime() <= now.getTime()) return "OFFER_EXPIRED";
  return null;
}

/**
 * Campaign is APPROVED, inside its [startDate, endDate) window, and its
 * offer is active and unexpired.
 */
export function isSponsorshipLive(c: LivenessFields, now: Date): boolean {
  return sponsorshipNotLiveReason(c, now) === null;
}

/**
 * Developer opt-in and category opt-out. A null sponsorCategory never
 * excludes anything; a set one is only compared against the developer's
 * own opt-out list (no platform-defined category list exists).
 */
export function isDeveloperEligibleForSponsorship(
  c: Pick<SponsorshipCandidate, "sponsorCategory" | "eligibleClientTypes" | "mode" | "presentationMode" | "creatives">,
  dev: SponsorshipDeveloperContext
): boolean {
  if (!dev.enabled) return false;
  if (c.mode === "BETA" && !dev.betaMember) return false;
  if (c.presentationMode === "VIDEO" && !selectCreativeForWindow(c.creatives ?? [], dev.availableSeconds)) return false;
  if (!isClientTypeEligible(c.eligibleClientTypes, dev.clientType)) return false;
  if (c.sponsorCategory) {
    const optOut = (dev.categoriesOptOut ?? []).map((x) => x.toLowerCase());
    if (optOut.includes(c.sponsorCategory.toLowerCase())) return false;
  }
  return true;
}

/**
 * True if charging `additionalCents` now would push the campaign over its
 * daily and/or total budget. Same shape and semantics as budget.ts and the
 * ad-server's isBudgetExceeded, so the soft-cap behaviour matches the ad
 * system exactly.
 */
export function wouldExceedSponsorshipBudget(
  c: Pick<SponsorshipCandidate, "dailyBudgetCents" | "totalBudgetCents">,
  usage: BudgetUsage,
  additionalCents: number
): boolean {
  if (c.dailyBudgetCents != null && usage.spentTodayCents + additionalCents > c.dailyBudgetCents) return true;
  if (c.totalBudgetCents != null && usage.spentTotalCents + additionalCents > c.totalBudgetCents) return true;
  return false;
}

export function hasSponsorshipBudgetRemaining(
  c: Pick<SponsorshipCandidate, "dailyBudgetCents" | "totalBudgetCents" | "sponsorChargeCents">,
  usage: BudgetUsage
): boolean {
  return !wouldExceedSponsorshipBudget(c, usage, c.sponsorChargeCents);
}

/** Per-developer, per-campaign display cap for today (reuses frequencyCap.ts counting). */
export function isSponsorshipFrequencyCapped(
  c: Pick<SponsorshipCandidate, "campaignId" | "frequencyCapPerDay">,
  displayHistory: ImpressionHistoryEntry[],
  defaultFrequencyCapPerDay: number,
  now: Date
): boolean {
  const cap = c.frequencyCapPerDay ?? defaultFrequencyCapPerDay;
  return countImpressionsToday(displayHistory, now, c.campaignId) >= cap;
}

/**
 * Returns the cap that would be violated by granting one more reward, or
 * null if the developer can still earn from this campaign.
 */
export function developerRewardCapReached(
  c: Pick<SponsorshipCandidate, "developerDailyCap" | "developerLifetimeCap">,
  counts: DeveloperRewardCounts
): "DAILY" | "LIFETIME" | null {
  if (c.developerLifetimeCap != null && counts.earnedLifetime >= c.developerLifetimeCap) return "LIFETIME";
  if (c.developerDailyCap != null && counts.earnedToday >= c.developerDailyCap) return "DAILY";
  return null;
}

/**
 * Full pipeline: live -> developer/client eligible -> budget remaining ->
 * developer reward caps -> display frequency cap -> highest sponsor charge
 * wins (ties: a fitting VIDEO offer, then the offer shown least today, then
 * the caller's ordering).
 */
export function selectSponsoredOffer(input: SelectSponsoredOfferInput): SponsorshipCandidate | null {
  const now = input.now ?? new Date();

  const eligible = input.candidates.filter((c) => {
    if (!isSponsorshipLive(c, now)) return false;
    if (!isDeveloperEligibleForSponsorship(c, input.dev)) return false;

    const usage = input.budgetByCampaignId[c.campaignId] ?? { spentTodayCents: 0, spentTotalCents: 0 };
    if (!hasSponsorshipBudgetRemaining(c, usage)) return false;

    const counts = input.rewardCountsByCampaignId[c.campaignId] ?? { earnedToday: 0, earnedLifetime: 0 };
    if (developerRewardCapReached(c, counts) !== null) return false;

    if (isSponsorshipFrequencyCapped(c, input.displayHistory, input.defaultFrequencyCapPerDay, now)) return false;
    return true;
  });

  if (eligible.length === 0) return null;
  // Ranking: highest sponsor charge wins. Ties, which are otherwise
  // arbitrary, prefer (1) a VIDEO offer (only a fitting one survives the
  // filter above, so it uses the available seconds the client reported),
  // then (2) the offer shown to this developer least often today, so equal
  // campaigns rotate, then (3) caller order.
  const shownToday = (c: SponsorshipCandidate) => countImpressionsToday(input.displayHistory, now, c.campaignId);
  const fitsVideo = (c: SponsorshipCandidate) => (c.presentationMode === "VIDEO" ? 1 : 0);
  const better = (a: SponsorshipCandidate, b: SponsorshipCandidate) => {
    if (a.sponsorChargeCents !== b.sponsorChargeCents) return a.sponsorChargeCents > b.sponsorChargeCents;
    if (fitsVideo(a) !== fitsVideo(b)) return fitsVideo(a) > fitsVideo(b);
    return shownToday(a) < shownToday(b);
  };
  return eligible.reduce((best, c) => (better(c, best) ? c : best), eligible[0]);
}

export interface ListEligibleSponsoredOffersInput {
  candidates: SponsorshipCandidate[];
  /** clientType is optional here: omitted = do not filter by client type. */
  dev: Omit<SponsorshipDeveloperContext, "clientType"> & { clientType?: string };
  budgetByCampaignId: Record<string, BudgetUsage>;
  rewardCountsByCampaignId: Record<string, DeveloperRewardCounts>;
  now?: Date;
}

/**
 * Read-only browsing counterpart to selectSponsoredOffer: every candidate the
 * developer could currently be served and rewarded for, in the caller's
 * order, instead of one winner.
 *
 * Applies the same predicates as selection (live -> developer/client
 * eligible -> budget remaining -> developer reward caps) with two deliberate
 * differences:
 *  - No display frequency cap. That cap limits how often an offer is SERVED
 *    to a tool today; it says nothing about whether the offer is running or
 *    whether the developer may still earn from it, and a listing is not a
 *    display. This function therefore takes no display history at all.
 *  - clientType is optional. Without one, client-type restrictions are not
 *    applied and the caller shows each offer's eligibleClientTypes instead.
 */
export function listEligibleSponsoredOffers(input: ListEligibleSponsoredOffersInput): SponsorshipCandidate[] {
  const now = input.now ?? new Date();
  const { clientType } = input.dev;

  return input.candidates.filter((c) => {
    if (!isSponsorshipLive(c, now)) return false;

    // A listing is not a display: no interaction or available time is
    // involved, so the VIDEO-fits rule (a presentation rule) does not apply.
    const browse = { ...c, presentationMode: undefined };
    const eligible =
      clientType === undefined
        ? // Same opt-in and category rules, minus the client-type restriction.
          isDeveloperEligibleForSponsorship({ ...browse, eligibleClientTypes: [] }, { ...input.dev, clientType: "" })
        : isDeveloperEligibleForSponsorship(browse, { ...input.dev, clientType });
    if (!eligible) return false;

    const usage = input.budgetByCampaignId[c.campaignId] ?? { spentTodayCents: 0, spentTotalCents: 0 };
    if (!hasSponsorshipBudgetRemaining(c, usage)) return false;

    const counts = input.rewardCountsByCampaignId[c.campaignId] ?? { earnedToday: 0, earnedLifetime: 0 };
    return developerRewardCapReached(c, counts) === null;
  });
}
