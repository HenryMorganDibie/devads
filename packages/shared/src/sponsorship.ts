import { z } from "zod";

// ---------------------------------------------------------------------------
// Sponsorship domain DTOs.
//
// Mirrors the Prisma sponsorship enums (kept independent of
// @devads/database, same as dto.ts). Every request schema here is a
// non-strict z.object, so unknown keys (e.g. a client trying to send its own
// reward amount) are stripped, never trusted. Nothing in these schemas
// requires or enumerates a specific sponsor, sponsor category or AI provider.
// ---------------------------------------------------------------------------

export const DevClientTypeSchema = z.enum([
  "VS_CODE",
  "CLAUDE_CODE",
  "CODEX",
  "GEMINI",
  "CURSOR",
  "OPENCODE",
  "AIDER",
  "CUSTOM_AGENT",
  "LOCAL_AGENT",
  "OTHER",
]);
export type DevClientTypeDTO = z.infer<typeof DevClientTypeSchema>;

export const DevSessionStatusSchema = z.enum(["ACTIVE", "ENDED"]);
export type DevSessionStatusDTO = z.infer<typeof DevSessionStatusSchema>;

export const SponsorshipCampaignStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "ARCHIVED",
]);
export type SponsorshipCampaignStatusDTO = z.infer<typeof SponsorshipCampaignStatusSchema>;

export const SponsorshipObjectiveSchema = z.enum([
  "AWARENESS",
  "QUALIFIED_ENGAGEMENT",
  "PRODUCT_DISCOVERY",
  "TRIAL_ACTIVATION",
  "OTHER",
]);
export type SponsorshipObjectiveDTO = z.infer<typeof SponsorshipObjectiveSchema>;

export const RewardTypeSchema = z.enum([
  "AI_CREDITS",
  "API_CREDITS",
  "COMPUTE_CREDITS",
  "TOOL_CREDITS",
  "CASH",
  "DISCOUNT",
  "SUBSCRIPTION_CREDIT",
  "OTHER",
]);
export type RewardTypeDTO = z.infer<typeof RewardTypeSchema>;

export const SponsorshipEventTypeSchema = z.enum([
  "OFFER_REQUESTED",
  "OFFER_DISPLAYED",
  "OFFER_SKIPPED",
  "OFFER_OPENED",
  "OFFER_INTERACTED",
  "OFFER_COMPLETED",
]);
export type SponsorshipEventTypeDTO = z.infer<typeof SponsorshipEventTypeSchema>;

/** The subset a client may report. OFFER_DISPLAYED/REQUESTED are server-authoritative. */
export const ClientSponsorshipEventTypeSchema = z.enum([
  "OFFER_SKIPPED",
  "OFFER_OPENED",
  "OFFER_INTERACTED",
  "OFFER_COMPLETED",
]);

export const RewardStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "REVERSED"]);
export const RewardLedgerEntryTypeSchema = z.enum(["EARNED", "REVERSED", "REDEEMED", "EXPIRED", "ADJUSTMENT"]);

// ---------------------------------------------------------------------------
// Development sessions
// ---------------------------------------------------------------------------

/** Coarse activity label only: short slug, no spaces/paths/prompts. */
const ActivityCategorySchema = z
  .string()
  .max(32)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, "activityCategory must be a short coarse slug");

export const StartDevelopmentSessionSchema = z.object({
  clientType: DevClientTypeSchema,
  clientVersion: z.string().max(32).optional(),
  activityCategory: ActivityCategorySchema.optional(),
});
export type StartDevelopmentSessionInput = z.infer<typeof StartDevelopmentSessionSchema>;

export const DevelopmentSessionDTOSchema = z.object({
  id: z.string(),
  clientType: DevClientTypeSchema,
  clientVersion: z.string().nullable(),
  activityCategory: z.string().nullable(),
  status: DevSessionStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type DevelopmentSessionDTO = z.infer<typeof DevelopmentSessionDTOSchema>;

// ---------------------------------------------------------------------------
// Offer selection + events
// ---------------------------------------------------------------------------

export const SponsoredOfferRequestSchema = z.object({
  clientType: DevClientTypeSchema.optional(),
  sessionId: z.string().min(1).optional(),
});
export type SponsoredOfferRequest = z.infer<typeof SponsoredOfferRequestSchema>;

export const SponsoredOfferCandidateSchema = z.object({
  /** Server-issued OFFER_DISPLAYED eventId; clients reference it when reporting interactions. */
  displayEventId: z.string(),
  offerId: z.string(),
  campaignId: z.string(),
  title: z.string(),
  description: z.string(),
  ctaUrl: z.string().url(),
  requiredAction: z.string().nullable(),
  rewardType: RewardTypeSchema,
  rewardAmountUnits: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
});
export type SponsoredOfferCandidate = z.infer<typeof SponsoredOfferCandidateSchema>;

export const SponsoredOfferResponseSchema = z.object({
  offer: SponsoredOfferCandidateSchema.nullable(),
});
export type SponsoredOfferResponse = z.infer<typeof SponsoredOfferResponseSchema>;

// ---------------------------------------------------------------------------
// Read-only offer listing (browse, not select)
//
// GET /api/v1/sponsorships/offers lists the live offers a developer is
// eligible for without selecting one: it records no SponsorshipEvent, spends
// no display/frequency cap and never touches sponsor spend or display stats.
// A listed offer therefore has no displayEventId and cannot be reported
// against or completed; only an offer served by the selection endpoint can.
// ---------------------------------------------------------------------------

export const SponsoredOfferListRequestSchema = z.object({
  /** Optional: when given, only offers eligible for this client type are listed. */
  clientType: DevClientTypeSchema.optional(),
});
export type SponsoredOfferListRequest = z.infer<typeof SponsoredOfferListRequestSchema>;

export const SponsoredOfferListingSchema = SponsoredOfferCandidateSchema.omit({ displayEventId: true }).extend({
  /** Client types the offer can be served in. Empty = every client type. */
  eligibleClientTypes: z.array(DevClientTypeSchema),
});
export type SponsoredOfferListing = z.infer<typeof SponsoredOfferListingSchema>;

export const SponsoredOfferListResponseSchema = z.object({
  /** The developer's opt-in. When false, `offers` is always empty. */
  sponsoredContentEnabled: z.boolean(),
  offers: z.array(SponsoredOfferListingSchema),
});
export type SponsoredOfferListResponse = z.infer<typeof SponsoredOfferListResponseSchema>;

export const SponsorshipEventRequestSchema = z.object({
  eventId: z.string().min(1).max(128),
  type: ClientSponsorshipEventTypeSchema,
  displayEventId: z.string().min(1).max(128),
  sessionId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type SponsorshipEventRequest = z.infer<typeof SponsorshipEventRequestSchema>;

export const SponsorshipEventResponseSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean().optional(),
  rewarded: z.boolean().optional(),
  reward: z
    .object({
      rewardType: RewardTypeSchema,
      amountUnits: z.number().int().nonnegative(),
      status: RewardStatusSchema,
    })
    .optional(),
});
export type SponsorshipEventResponse = z.infer<typeof SponsorshipEventResponseSchema>;

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export const RewardWalletBalanceSchema = z.object({
  rewardType: RewardTypeSchema,
  availableUnits: z.number().int(),
  pendingUnits: z.number().int(),
  /** Balance recomputed from the ledger (source of truth); equals availableUnits when the cache is consistent. */
  ledgerAvailableUnits: z.number().int(),
});

export const RewardLedgerEntryDTOSchema = z.object({
  id: z.string(),
  rewardType: RewardTypeSchema,
  campaignId: z.string(),
  entryType: RewardLedgerEntryTypeSchema,
  amountUnits: z.number().int(),
  status: RewardStatusSchema,
  createdAt: z.string(),
});

export const RewardWalletResponseSchema = z.object({
  developerId: z.string(),
  balances: z.array(RewardWalletBalanceSchema),
  recentLedger: z.array(RewardLedgerEntryDTOSchema),
});
export type RewardWalletResponse = z.infer<typeof RewardWalletResponseSchema>;

// ---------------------------------------------------------------------------
// Sponsor-facing campaign management
// ---------------------------------------------------------------------------

export const SponsoredOfferInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  ctaUrl: z.string().url(),
  requiredAction: z.string().max(500).optional(),
  expiresAt: z.coerce.date().optional(),
});
export type SponsoredOfferInput = z.infer<typeof SponsoredOfferInputSchema>;

const SponsorshipCampaignFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  /** Optional, free-form, descriptive only. Never required by core logic. */
  sponsorCategory: z.string().min(1).max(64).nullable().optional(),
  objective: SponsorshipObjectiveSchema,
  rewardType: RewardTypeSchema,
  rewardAmountUnits: z.number().int().positive(),
  sponsorChargeCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("USD"),
  totalBudgetCents: z.number().int().positive().nullable().optional(),
  dailyBudgetCents: z.number().int().positive().nullable().optional(),
  developerDailyCap: z.number().int().positive().nullable().optional(),
  developerLifetimeCap: z.number().int().positive().nullable().optional(),
  frequencyCapPerDay: z.number().int().positive().nullable().optional(),
  eligibleClientTypes: z.array(DevClientTypeSchema).default([]),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
});

export const CreateSponsorshipCampaignSchema = SponsorshipCampaignFieldsSchema.extend({
  advertiserId: z.string().min(1),
  offers: z.array(SponsoredOfferInputSchema).max(20).optional(),
}).refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
  message: "endDate must be after startDate",
  path: ["endDate"],
});
export type CreateSponsorshipCampaignInput = z.infer<typeof CreateSponsorshipCampaignSchema>;

export const UpdateSponsorshipCampaignSchema = SponsorshipCampaignFieldsSchema.partial()
  .omit({ currency: true })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type UpdateSponsorshipCampaignInput = z.infer<typeof UpdateSponsorshipCampaignSchema>;

export const SponsoredOfferDTOSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  ctaUrl: z.string(),
  requiredAction: z.string().nullable(),
  expiresAt: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
export type SponsoredOfferDTO = z.infer<typeof SponsoredOfferDTOSchema>;

/** Whole-campaign totals (sponsor list route since Phase 1; admin list route too). */
export const SponsorshipCampaignStatsSchema = z.object({
  displays: z.number().int(),
  completions: z.number().int(),
  rewardsGranted: z.number().int(),
  spendCents: z.number().int(),
});
export type SponsorshipCampaignStatsDTO = z.infer<typeof SponsorshipCampaignStatsSchema>;

export const SponsorshipCampaignDTOSchema = z.object({
  id: z.string(),
  advertiserId: z.string(),
  name: z.string(),
  sponsorCategory: z.string().nullable(),
  objective: SponsorshipObjectiveSchema,
  rewardType: RewardTypeSchema,
  rewardAmountUnits: z.number().int(),
  sponsorChargeCents: z.number().int(),
  currency: z.string(),
  totalBudgetCents: z.number().int().nullable(),
  dailyBudgetCents: z.number().int().nullable(),
  developerDailyCap: z.number().int().nullable(),
  developerLifetimeCap: z.number().int().nullable(),
  frequencyCapPerDay: z.number().int().nullable(),
  eligibleClientTypes: z.array(DevClientTypeSchema),
  startDate: z.string(),
  endDate: z.string().nullable(),
  status: SponsorshipCampaignStatusSchema,
  rejectionReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  offers: z.array(SponsoredOfferDTOSchema),
  stats: SponsorshipCampaignStatsSchema.optional(),
});
export type SponsorshipCampaignDTO = z.infer<typeof SponsorshipCampaignDTOSchema>;

// ---------------------------------------------------------------------------
// Admin read-only sponsorship activity (fraud / abuse review)
//
// GET /api/v1/admin/sponsorship-campaigns            (list, enriched)
// GET /api/v1/admin/sponsorship-campaigns/:id/events  (SponsorshipEvent rows)
// GET /api/v1/admin/sponsorship-campaigns/:id/rewards (DeveloperRewardLedger rows)
//
// All requireAdmin and read-only. Row DTOs carry ids, enums, amounts and
// timestamps only: never event metadata, ledger descriptions, or any
// developer profile/user data beyond the developer id.
// ---------------------------------------------------------------------------

/** The existing campaign DTO plus the advertiser's name and (always present) stats. Purely additive. */
export const AdminSponsorshipCampaignDTOSchema = SponsorshipCampaignDTOSchema.extend({
  advertiserName: z.string(),
  stats: SponsorshipCampaignStatsSchema,
});
export type AdminSponsorshipCampaignDTO = z.infer<typeof AdminSponsorshipCampaignDTOSchema>;

export const ADMIN_ACTIVITY_DEFAULT_LIMIT = 50;
export const ADMIN_ACTIVITY_MAX_LIMIT = 200;

/**
 * Keyset pagination: rows are ordered newest first (createdAt desc, id desc).
 * `cursor` is the opaque `nextCursor` of the previous page; absent = first page.
 */
export const AdminActivityPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ADMIN_ACTIVITY_MAX_LIMIT).default(ADMIN_ACTIVITY_DEFAULT_LIMIT),
  cursor: z.string().min(1).max(256).optional(),
  /** Optional: only this developer's rows. */
  developerId: z.string().min(1).max(128).optional(),
});
export type AdminActivityPageQuery = z.infer<typeof AdminActivityPageQuerySchema>;

export const AdminSponsorshipEventsQuerySchema = AdminActivityPageQuerySchema.extend({
  /** Optional: only events of this type. */
  type: SponsorshipEventTypeSchema.optional(),
});
export type AdminSponsorshipEventsQuery = z.infer<typeof AdminSponsorshipEventsQuerySchema>;

function activityPageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const AdminSponsorshipEventDTOSchema = z.object({
  /** The event's idempotency key; OFFER_DISPLAYED eventIds are what `displayEventId` points at. */
  eventId: z.string(),
  type: SponsorshipEventTypeSchema,
  offerId: z.string(),
  developerId: z.string(),
  sessionId: z.string().nullable(),
  /** For client-reported events: the server-issued OFFER_DISPLAYED eventId they refer to. */
  displayEventId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminSponsorshipEventDTO = z.infer<typeof AdminSponsorshipEventDTOSchema>;

export const AdminSponsorshipEventsPageSchema = activityPageSchema(AdminSponsorshipEventDTOSchema);
export type AdminSponsorshipEventsPage = z.infer<typeof AdminSponsorshipEventsPageSchema>;

export const AdminRewardLedgerEntryDTOSchema = RewardLedgerEntryDTOSchema.extend({
  developerId: z.string(),
  /** The OFFER_DISPLAYED eventId an EARNED row rewards; null for non-event entries. */
  sponsorshipEventId: z.string().nullable(),
});
export type AdminRewardLedgerEntryDTO = z.infer<typeof AdminRewardLedgerEntryDTOSchema>;

export const AdminSponsorshipRewardsPageSchema = activityPageSchema(AdminRewardLedgerEntryDTOSchema);
export type AdminSponsorshipRewardsPage = z.infer<typeof AdminSponsorshipRewardsPageSchema>;
