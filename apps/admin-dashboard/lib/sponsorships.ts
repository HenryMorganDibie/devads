import { apiGet, apiPost } from "./api";

// ---------------------------------------------------------------------------
// Admin review of Sponsorship campaigns (Phase 5).
//
// Consumes these admin routes:
//
//   GET  /api/v1/admin/sponsorship-campaigns?status=...
//   POST /api/v1/admin/sponsorship-campaigns/:id/approve   SUBMITTED -> APPROVED
//   POST /api/v1/admin/sponsorship-campaigns/:id/reject    SUBMITTED -> REJECTED { reason }
//   POST /api/v1/admin/sponsorship-campaigns/:id/pause     APPROVED  -> PAUSED
//   GET  /api/v1/admin/sponsorship-campaigns/:id/events    read-only, paginated
//   GET  /api/v1/admin/sponsorship-campaigns/:id/rewards   read-only, paginated
//
// The list route also carries `advertiserName` and `stats` (added after
// Phase 5, purely additively). They are optional here and validated when
// present, so the list still parses against a server without them.
//
// Types mirror AdminSponsorshipCampaignDTOSchema, AdminSponsorshipEventDTOSchema
// and AdminRewardLedgerEntryDTOSchema in packages/shared/src/sponsorship.ts,
// and responses are checked structurally before rendering. Money is integer
// cents and rewards integer units, formatted from their digits (no floats).
// ---------------------------------------------------------------------------

export const SPONSORSHIP_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAUSED", "ARCHIVED"] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

export const SPONSORSHIP_OBJECTIVES = [
  "AWARENESS",
  "QUALIFIED_ENGAGEMENT",
  "PRODUCT_DISCOVERY",
  "TRIAL_ACTIVATION",
  "OTHER",
] as const;
export type SponsorshipObjective = (typeof SPONSORSHIP_OBJECTIVES)[number];

export const REWARD_TYPES = [
  "AI_CREDITS",
  "API_CREDITS",
  "COMPUTE_CREDITS",
  "TOOL_CREDITS",
  "CASH",
  "DISCOUNT",
  "SUBSCRIPTION_CREDIT",
  "OTHER",
  "BETA_CREDITS",
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export const DEV_CLIENT_TYPES = [
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
  "WEB",
] as const;
export type DevClientType = (typeof DEV_CLIENT_TYPES)[number];

const OFFER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const OBJECTIVE_LABELS: Record<SponsorshipObjective, string> = {
  AWARENESS: "Awareness",
  QUALIFIED_ENGAGEMENT: "Qualified engagement",
  PRODUCT_DISCOVERY: "Product discovery",
  TRIAL_ACTIVATION: "Trial activation",
  OTHER: "Other",
};

const REWARD_LABELS: Record<RewardType, string> = {
  AI_CREDITS: "AI Credits",
  API_CREDITS: "API Credits",
  COMPUTE_CREDITS: "Compute Credits",
  TOOL_CREDITS: "Tool Credits",
  CASH: "Cash",
  DISCOUNT: "Discount",
  SUBSCRIPTION_CREDIT: "Subscription Credit",
  OTHER: "Other Reward",
  BETA_CREDITS: "Beta Credits",
};

const CLIENT_LABELS: Record<DevClientType, string> = {
  VS_CODE: "VS Code",
  CLAUDE_CODE: "Claude Code",
  CODEX: "Codex",
  GEMINI: "Gemini",
  CURSOR: "Cursor",
  OPENCODE: "OpenCode",
  AIDER: "Aider",
  CUSTOM_AGENT: "Custom agents",
  LOCAL_AGENT: "Local agents",
  OTHER: "Other tools",
  WEB: "DevAds web",
};

export function objectiveLabel(o: SponsorshipObjective): string {
  return OBJECTIVE_LABELS[o];
}
export function rewardTypeLabel(r: RewardType): string {
  return REWARD_LABELS[r];
}
export function formatClientTypes(types: readonly DevClientType[]): string {
  if (types.length === 0) return "All developer tools";
  return types.map((t) => CLIENT_LABELS[t]).join(", ");
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatUnits(units: number): string {
  if (!Number.isSafeInteger(units)) return String(units);
  const negative = units < 0;
  const grouped = groupDigits(String(negative ? -units : units));
  return negative ? `-${grouped}` : grouped;
}

/** Integer cents from the digits alone: 123456 USD -> "$1,234.56". No division, no float. */
export function formatMoneyCents(cents: number, currency = "USD"): string {
  if (!Number.isSafeInteger(cents)) return String(cents);
  const negative = cents < 0;
  const digits = String(negative ? -cents : cents).padStart(3, "0");
  const amount = `${groupDigits(digits.slice(0, -2))}.${digits.slice(-2)}`;
  const withSymbol = currency === "USD" ? `$${amount}` : `${currency} ${amount}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "None";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toISOString().slice(0, 10);
}

export interface AdminSponsoredOffer {
  id: string;
  title: string;
  description: string;
  ctaUrl: string;
  requiredAction: string | null;
  expiresAt: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface AdminSponsorshipCampaign {
  id: string;
  advertiserId: string;
  name: string;
  sponsorCategory: string | null;
  objective: SponsorshipObjective;
  rewardType: RewardType;
  rewardAmountUnits: number;
  sponsorChargeCents: number;
  currency: string;
  totalBudgetCents: number | null;
  dailyBudgetCents: number | null;
  developerDailyCap: number | null;
  developerLifetimeCap: number | null;
  frequencyCapPerDay: number | null;
  eligibleClientTypes: DevClientType[];
  startDate: string;
  endDate: string | null;
  status: SponsorshipStatus;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  offers: AdminSponsoredOffer[];
  /** The sponsor's display name (additive field on the admin list). */
  advertiserName?: string;
  /** Whole-campaign totals, same numbers the sponsor sees (additive field on the admin list). */
  stats?: SponsorshipCampaignStats;
}

export interface SponsorshipCampaignStats {
  displays: number;
  completions: number;
  rewardsGranted: number;
  spendCents: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}
function isNullableInt(v: unknown): v is number | null {
  return v === null || isInt(v);
}
function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isOffer(v: unknown): v is AdminSponsoredOffer {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.description === "string" &&
    typeof v.ctaUrl === "string" &&
    isNullableString(v.requiredAction) &&
    isNullableString(v.expiresAt) &&
    isOneOf(OFFER_STATUSES, v.status)
  );
}

/** Rejects missing fields, unknown enums and non-integer money/units. */
export function isAdminSponsorshipCampaign(v: unknown): v is AdminSponsorshipCampaign {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.advertiserId === "string" &&
    typeof v.name === "string" &&
    isNullableString(v.sponsorCategory) &&
    isOneOf(SPONSORSHIP_OBJECTIVES, v.objective) &&
    isOneOf(REWARD_TYPES, v.rewardType) &&
    isInt(v.rewardAmountUnits) &&
    isInt(v.sponsorChargeCents) &&
    typeof v.currency === "string" &&
    isNullableInt(v.totalBudgetCents) &&
    isNullableInt(v.dailyBudgetCents) &&
    isNullableInt(v.developerDailyCap) &&
    isNullableInt(v.developerLifetimeCap) &&
    isNullableInt(v.frequencyCapPerDay) &&
    Array.isArray(v.eligibleClientTypes) &&
    v.eligibleClientTypes.every((t) => isOneOf(DEV_CLIENT_TYPES, t)) &&
    typeof v.startDate === "string" &&
    isNullableString(v.endDate) &&
    isOneOf(SPONSORSHIP_STATUSES, v.status) &&
    isNullableString(v.rejectionReason) &&
    isNullableString(v.submittedAt) &&
    isNullableString(v.approvedAt) &&
    typeof v.createdAt === "string" &&
    Array.isArray(v.offers) &&
    v.offers.every(isOffer) &&
    (v.advertiserName === undefined || typeof v.advertiserName === "string") &&
    (v.stats === undefined || isStats(v.stats))
  );
}

function isStats(v: unknown): v is SponsorshipCampaignStats {
  return isObject(v) && isInt(v.displays) && isInt(v.completions) && isInt(v.rewardsGranted) && isInt(v.spendCents);
}

export interface AdminSponsorshipLists {
  /** SUBMITTED, oldest submission first (review order). */
  queue: AdminSponsorshipCampaign[];
  /** Everything else, newest first as the server returns it. */
  others: AdminSponsorshipCampaign[];
}

/** Pure: splits the admin list into the review queue and the rest. */
export function splitReviewQueue(campaigns: AdminSponsorshipCampaign[]): AdminSponsorshipLists {
  const queue = campaigns
    .filter((c) => c.status === "SUBMITTED")
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
  return { queue, others: campaigns.filter((c) => c.status !== "SUBMITTED") };
}

/** RejectBody in sponsorshipCampaigns.ts: 1-500 characters. */
export function validateRejectReason(reason: string | null): { ok: true; reason: string } | { ok: false; message: string } {
  const r = (reason ?? "").trim();
  if (!r) return { ok: false, message: "A rejection reason is required." };
  if (r.length > 500) return { ok: false, message: "Keep the rejection reason to 500 characters or fewer." };
  return { ok: true, reason: r };
}

type Getter = typeof apiGet;
type Poster = typeof apiPost;

export type AdminSponsorshipListResult =
  | { status: "ok"; campaigns: AdminSponsorshipCampaign[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const NETWORK_ERROR = "We couldn't reach DevAds. Check your connection and try again.";

/** All sponsorship campaigns (every status). Never throws. */
export async function fetchAdminSponsorshipCampaigns(get: Getter = apiGet): Promise<AdminSponsorshipListResult> {
  try {
    const { ok, status, data } = await get<unknown>("/api/v1/admin/sponsorship-campaigns");
    // requireAdmin answers 403 for a missing, expired or non-admin session.
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) return { status: "error", message: "We couldn't load sponsorship campaigns. Please try again." };
    if (!Array.isArray(data) || !data.every(isAdminSponsorshipCampaign)) {
      return { status: "error", message: "Sponsorship campaigns came back in a format we couldn't read." };
    }
    return { status: "ok", campaigns: data };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

export type AdminActionResult = { status: "ok" } | { status: "unauthenticated" } | { status: "error"; message: string };

const ACTION_ERRORS: Record<string, string> = {
  campaign_not_found: "That sponsorship campaign no longer exists.",
  campaign_not_submitted: "That sponsorship campaign is no longer waiting for review.",
  campaign_not_approved: "Only approved sponsorship campaigns can be paused.",
  invalid_request: "The request wasn't accepted.",
};

async function postAction(path: string, body: unknown, fallback: string, post: Poster): Promise<AdminActionResult> {
  try {
    const { ok, status, data } = await post<unknown>(path, body);
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) {
      const code = isObject(data) && typeof data.error === "string" ? data.error : "";
      return { status: "error", message: ACTION_ERRORS[code] ?? fallback };
    }
    return { status: "ok" };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

const base = (id: string) => `/api/v1/admin/sponsorship-campaigns/${encodeURIComponent(id)}`;

export function approveSponsorshipCampaign(id: string, post: Poster = apiPost) {
  return postAction(`${base(id)}/approve`, {}, "We couldn't approve the sponsorship campaign.", post);
}

export function rejectSponsorshipCampaign(id: string, reason: string, post: Poster = apiPost) {
  return postAction(`${base(id)}/reject`, { reason }, "We couldn't reject the sponsorship campaign.", post);
}

export function pauseSponsorshipCampaign(id: string, post: Poster = apiPost) {
  return postAction(`${base(id)}/pause`, {}, "We couldn't pause the sponsorship campaign.", post);
}

// ---------------------------------------------------------------------------
// Sponsorship activity (read-only, for fraud and abuse review)
//
// Both routes page newest first with an opaque `nextCursor` (null on the
// last page). The server caps `limit` at 200; the page size here is fixed.
// ---------------------------------------------------------------------------

export const ACTIVITY_PAGE_SIZE = 50;

export const SPONSORSHIP_EVENT_TYPES = [
  "OFFER_REQUESTED",
  "OFFER_DISPLAYED",
  "OFFER_SKIPPED",
  "OFFER_OPENED",
  "OFFER_INTERACTED",
  "OFFER_COMPLETED",
] as const;
export type SponsorshipEventType = (typeof SPONSORSHIP_EVENT_TYPES)[number];

export const REWARD_ENTRY_TYPES = ["EARNED", "REVERSED", "REDEEMED", "EXPIRED", "ADJUSTMENT"] as const;
export type RewardEntryType = (typeof REWARD_ENTRY_TYPES)[number];

export const REWARD_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REVERSED"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

const EVENT_TYPE_LABELS: Record<SponsorshipEventType, string> = {
  OFFER_REQUESTED: "Requested",
  OFFER_DISPLAYED: "Displayed",
  OFFER_SKIPPED: "Skipped",
  OFFER_OPENED: "Opened",
  OFFER_INTERACTED: "Interacted",
  OFFER_COMPLETED: "Completed",
};

export function eventTypeLabel(t: SponsorshipEventType): string {
  return EVENT_TYPE_LABELS[t];
}

export interface AdminSponsorshipEvent {
  eventId: string;
  type: SponsorshipEventType;
  offerId: string;
  developerId: string;
  sessionId: string | null;
  displayEventId: string | null;
  createdAt: string;
}

export interface AdminRewardLedgerEntry {
  id: string;
  developerId: string;
  rewardType: RewardType;
  campaignId: string;
  sponsorshipEventId: string | null;
  entryType: RewardEntryType;
  amountUnits: number;
  status: RewardStatus;
  createdAt: string;
}

export interface ActivityPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function isAdminSponsorshipEvent(v: unknown): v is AdminSponsorshipEvent {
  return (
    isObject(v) &&
    typeof v.eventId === "string" &&
    isOneOf(SPONSORSHIP_EVENT_TYPES, v.type) &&
    typeof v.offerId === "string" &&
    typeof v.developerId === "string" &&
    isNullableString(v.sessionId) &&
    isNullableString(v.displayEventId) &&
    typeof v.createdAt === "string"
  );
}

export function isAdminRewardLedgerEntry(v: unknown): v is AdminRewardLedgerEntry {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.developerId === "string" &&
    isOneOf(REWARD_TYPES, v.rewardType) &&
    typeof v.campaignId === "string" &&
    isNullableString(v.sponsorshipEventId) &&
    isOneOf(REWARD_ENTRY_TYPES, v.entryType) &&
    isInt(v.amountUnits) &&
    isOneOf(REWARD_STATUSES, v.status) &&
    typeof v.createdAt === "string"
  );
}

function isPage<T>(v: unknown, isItem: (x: unknown) => x is T): v is ActivityPage<T> {
  return isObject(v) && Array.isArray(v.items) && v.items.every(isItem) && isNullableString(v.nextCursor);
}

/** Time to the second in UTC, for spotting bursts: "2026-09-29 12:00:05". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type ActivityPageResult<T> =
  | { status: "ok"; page: ActivityPage<T> }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

async function fetchActivityPage<T>(
  path: string,
  cursor: string | null,
  isItem: (x: unknown) => x is T,
  what: string,
  get: Getter
): Promise<ActivityPageResult<T>> {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  try {
    const { ok, status, data } = await get<unknown>(`${path}?${params.toString()}`);
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (status === 404) return { status: "error", message: "That sponsorship campaign no longer exists." };
    if (!ok) return { status: "error", message: `We couldn't load ${what}. Please try again.` };
    if (!isPage(data, isItem)) return { status: "error", message: `The ${what} came back in a format we couldn't read.` };
    return { status: "ok", page: data };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

/** One page of a campaign's SponsorshipEvent rows, newest first. Never throws. */
export function fetchSponsorshipEvents(campaignId: string, cursor: string | null = null, get: Getter = apiGet) {
  return fetchActivityPage(`${base(campaignId)}/events`, cursor, isAdminSponsorshipEvent, "sponsorship events", get);
}

/** One page of a campaign's DeveloperRewardLedger rows, newest first. Never throws. */
export function fetchSponsorshipRewards(campaignId: string, cursor: string | null = null, get: Getter = apiGet) {
  return fetchActivityPage(`${base(campaignId)}/rewards`, cursor, isAdminRewardLedgerEntry, "reward ledger entries", get);
}
