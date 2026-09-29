import { apiGet, apiPost } from "./api";

// ---------------------------------------------------------------------------
// Sponsor-facing Sponsorship campaigns (Phase 5).
//
// A Sponsorship campaign funds Developer Rewards: a developer who completes a
// sponsored offer earns reward units, and the sponsor is charged per rewarded
// completion. It is a separate product from Ad Campaigns (CPM-priced
// impressions), with its own routes:
//
//   POST  /api/v1/sponsorship-campaigns               create (DRAFT)
//   POST  /api/v1/sponsorship-campaigns/:id/offers    add an offer (DRAFT only)
//   POST  /api/v1/sponsorship-campaigns/:id/submit    DRAFT -> SUBMITTED
//   GET   /api/v1/sponsorship-campaigns?advertiserId= list, with stats
//
// Types mirror CreateSponsorshipCampaignSchema, SponsoredOfferInputSchema and
// SponsorshipCampaignDTOSchema in packages/shared/src/sponsorship.ts. Like the
// developer pages in apps/web, they are declared here (the dashboard doesn't
// depend on @devads/shared) and every response is checked structurally
// before it is rendered.
//
// Money is integer cents and rewards are integer units end to end: input is
// parsed from its digits and output is formatted from its digits. Nothing here
// divides, multiplies by a fraction or goes through a float.
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
  // BETA_CREDITS is deliberately absent: only DevAds beta campaigns grant
  // them, and the API rejects them in sponsor-created campaigns.
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

export const OFFER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

const STATUS_LABELS: Record<SponsorshipStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

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

export function statusLabel(s: SponsorshipStatus): string {
  return STATUS_LABELS[s];
}
export function objectiveLabel(o: SponsorshipObjective): string {
  return OBJECTIVE_LABELS[o];
}
export function rewardTypeLabel(r: RewardType): string {
  return REWARD_LABELS[r];
}
export function clientTypeLabel(c: DevClientType): string {
  return CLIENT_LABELS[c];
}

/** "VS Code, Cursor", or "All developer tools" when the campaign isn't restricted. */
export function formatClientTypes(types: readonly DevClientType[]): string {
  if (types.length === 0) return "All developer tools";
  return types.map(clientTypeLabel).join(", ");
}

// ---------------------------------------------------------------------------
// Integer formatting and parsing
// ---------------------------------------------------------------------------

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Integer units with digit grouping ("1240" -> "1,240"). */
export function formatUnits(units: number): string {
  if (!Number.isSafeInteger(units)) return String(units);
  const negative = units < 0;
  const grouped = groupDigits(String(negative ? -units : units));
  return negative ? `-${grouped}` : grouped;
}

/**
 * Integer cents to a currency string from the digits alone: 123456 USD ->
 * "$1,234.56", 5 -> "$0.05", 1500 EUR -> "EUR 15.00". No division, no float.
 */
export function formatMoneyCents(cents: number, currency = "USD"): string {
  if (!Number.isSafeInteger(cents)) return String(cents);
  const negative = cents < 0;
  const digits = String(negative ? -cents : cents).padStart(3, "0");
  const amount = `${groupDigits(digits.slice(0, -2))}.${digits.slice(-2)}`;
  const withSymbol = currency === "USD" ? `$${amount}` : `${currency} ${amount}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

/**
 * "12", "12.5", "12.50", "1,200.00" -> integer cents, parsed from the digits
 * (no parseFloat). Returns null for anything else, including more than two
 * decimal places or a value that isn't a safe integer in cents.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(`${m[1]}${(m[2] ?? "").padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Whole positive number ("1,000" allowed), or null. */
export function parsePositiveInt(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** YYYY-MM-DD (UTC) for display. */
export function formatDate(iso: string | null): string {
  if (!iso) return "None";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toISOString().slice(0, 10);
}

/** A date input value ("2026-10-01") as the start of that UTC day, or null. */
export function dateInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Response types + structural checks
// ---------------------------------------------------------------------------

export interface SponsoredOffer {
  id: string;
  title: string;
  description: string;
  ctaUrl: string;
  requiredAction: string | null;
  expiresAt: string | null;
  status: OfferStatus;
}

export interface SponsorshipStats {
  displays: number;
  completions: number;
  rewardsGranted: number;
  spendCents: number;
}

export interface SponsorshipCampaign {
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
  offers: SponsoredOffer[];
  /** Only the sponsor list route returns stats. */
  stats?: SponsorshipStats;
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

export function isSponsoredOffer(v: unknown): v is SponsoredOffer {
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

function isStats(v: unknown): v is SponsorshipStats {
  return isObject(v) && isInt(v.displays) && isInt(v.completions) && isInt(v.rewardsGranted) && isInt(v.spendCents);
}

/** Rejects missing fields, unknown enums and non-integer money/units. */
export function isSponsorshipCampaign(v: unknown): v is SponsorshipCampaign {
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
    v.offers.every(isSponsoredOffer) &&
    (v.stats === undefined || isStats(v.stats))
  );
}

// ---------------------------------------------------------------------------
// Forms -> request bodies
// ---------------------------------------------------------------------------

export interface OfferFormValues {
  title: string;
  description: string;
  ctaUrl: string;
  requiredAction: string;
  /** Date input value (YYYY-MM-DD) or "". */
  expiresAt: string;
}

export function emptyOfferForm(): OfferFormValues {
  return { title: "", description: "", ctaUrl: "", requiredAction: "", expiresAt: "" };
}

export interface CampaignFormValues {
  name: string;
  /** Optional. Blank is sent as no category at all. */
  sponsorCategory: string;
  objective: SponsorshipObjective;
  rewardType: RewardType;
  rewardAmountUnits: string;
  /** Dollars, e.g. "2.50". */
  sponsorCharge: string;
  totalBudget: string;
  dailyBudget: string;
  developerDailyCap: string;
  developerLifetimeCap: string;
  frequencyCapPerDay: string;
  /** Empty = all client types. */
  eligibleClientTypes: DevClientType[];
  startDate: string;
  endDate: string;
  /** Optional first offer; only sent when any of its fields is filled. */
  offer: OfferFormValues;
}

export function emptyCampaignForm(): CampaignFormValues {
  return {
    name: "",
    sponsorCategory: "",
    objective: "PRODUCT_DISCOVERY",
    rewardType: "AI_CREDITS",
    rewardAmountUnits: "",
    sponsorCharge: "",
    totalBudget: "",
    dailyBudget: "",
    developerDailyCap: "",
    developerLifetimeCap: "",
    frequencyCapPerDay: "",
    eligibleClientTypes: [],
    startDate: "",
    endDate: "",
    offer: emptyOfferForm(),
  };
}

export type FormErrors = Record<string, string>;

/** Body for POST /sponsorship-campaigns/:id/offers (SponsoredOfferInputSchema). */
export interface OfferPayload {
  title: string;
  description: string;
  ctaUrl: string;
  requiredAction?: string;
  expiresAt?: string;
}

/** Body for POST /sponsorship-campaigns (CreateSponsorshipCampaignSchema). */
export interface CreateCampaignPayload {
  advertiserId: string;
  name: string;
  sponsorCategory?: string;
  objective: SponsorshipObjective;
  rewardType: RewardType;
  rewardAmountUnits: number;
  sponsorChargeCents: number;
  currency: "USD";
  totalBudgetCents?: number;
  dailyBudgetCents?: number;
  developerDailyCap?: number;
  developerLifetimeCap?: number;
  frequencyCapPerDay?: number;
  eligibleClientTypes: DevClientType[];
  startDate?: string;
  endDate?: string;
  offers?: OfferPayload[];
}

export type BuildResult<T> = { ok: true; payload: T } | { ok: false; errors: FormErrors };

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isOfferBlank(o: OfferFormValues): boolean {
  return [o.title, o.description, o.ctaUrl, o.requiredAction, o.expiresAt].every((v) => v.trim() === "");
}

/** Validates an offer form against SponsoredOfferInputSchema's limits. Error keys are prefixed with `prefix`. */
export function validateOffer(o: OfferFormValues, prefix = ""): BuildResult<OfferPayload> {
  const errors: FormErrors = {};
  const title = o.title.trim();
  const description = o.description.trim();
  const ctaUrl = o.ctaUrl.trim();
  const requiredAction = o.requiredAction.trim();
  if (!title) errors[`${prefix}title`] = "Enter an offer title.";
  else if (title.length > 200) errors[`${prefix}title`] = "Keep the title to 200 characters or fewer.";
  if (!description) errors[`${prefix}description`] = "Describe the offer.";
  else if (description.length > 1000) errors[`${prefix}description`] = "Keep the description to 1,000 characters or fewer.";
  if (!isHttpUrl(ctaUrl)) errors[`${prefix}ctaUrl`] = "Enter a full link, starting with https://.";
  if (requiredAction.length > 500) errors[`${prefix}requiredAction`] = "Keep the required action to 500 characters or fewer.";
  let expiresAt: string | undefined;
  if (o.expiresAt) {
    const iso = dateInputToIso(o.expiresAt);
    if (!iso) errors[`${prefix}expiresAt`] = "Enter a valid date.";
    else expiresAt = iso;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      title,
      description,
      ctaUrl,
      ...(requiredAction ? { requiredAction } : {}),
      ...(expiresAt ? { expiresAt } : {}),
    },
  };
}

function optionalCents(value: string, key: string, label: string, errors: FormErrors): number | undefined {
  if (!value.trim()) return undefined;
  const cents = parseMoneyToCents(value);
  if (cents === null || cents <= 0) {
    errors[key] = `${label} must be an amount above zero, with at most two decimal places.`;
    return undefined;
  }
  return cents;
}

function optionalCount(value: string, key: string, label: string, errors: FormErrors): number | undefined {
  if (!value.trim()) return undefined;
  const n = parsePositiveInt(value);
  if (n === null) {
    errors[key] = `${label} must be a whole number above zero.`;
    return undefined;
  }
  return n;
}

/**
 * Pure: form values -> a CreateSponsorshipCampaignSchema body, or field errors.
 * Optional fields left blank are omitted entirely (never sent as 0 or "").
 * The sponsor category is optional: blank means no category.
 */
export function buildCreateCampaignPayload(
  form: CampaignFormValues,
  advertiserId: string
): BuildResult<CreateCampaignPayload> {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Enter a campaign name.";
  else if (name.length > 200) errors.name = "Keep the name to 200 characters or fewer.";

  const sponsorCategory = form.sponsorCategory.trim();
  if (sponsorCategory.length > 64) errors.sponsorCategory = "Keep the category to 64 characters or fewer.";

  const rewardAmountUnits = parsePositiveInt(form.rewardAmountUnits);
  if (rewardAmountUnits === null) errors.rewardAmountUnits = "Reward amount must be a whole number above zero.";

  const sponsorChargeCents = parseMoneyToCents(form.sponsorCharge);
  if (sponsorChargeCents === null) {
    errors.sponsorCharge = "Enter the charge per rewarded completion (0 or more, at most two decimal places).";
  }

  const totalBudgetCents = optionalCents(form.totalBudget, "totalBudget", "Total budget", errors);
  const dailyBudgetCents = optionalCents(form.dailyBudget, "dailyBudget", "Daily budget", errors);
  const developerDailyCap = optionalCount(form.developerDailyCap, "developerDailyCap", "Per-developer daily cap", errors);
  const developerLifetimeCap = optionalCount(
    form.developerLifetimeCap,
    "developerLifetimeCap",
    "Per-developer lifetime cap",
    errors
  );
  const frequencyCapPerDay = optionalCount(form.frequencyCapPerDay, "frequencyCapPerDay", "Display frequency cap", errors);

  let startDate: string | undefined;
  if (form.startDate) {
    startDate = dateInputToIso(form.startDate) ?? undefined;
    if (!startDate) errors.startDate = "Enter a valid start date.";
  }
  let endDate: string | undefined;
  if (form.endDate) {
    endDate = dateInputToIso(form.endDate) ?? undefined;
    if (!endDate) errors.endDate = "Enter a valid end date.";
  }
  if (startDate && endDate && endDate <= startDate) errors.endDate = "The end date must be after the start date.";

  let offers: OfferPayload[] | undefined;
  if (!isOfferBlank(form.offer)) {
    const offer = validateOffer(form.offer, "offer.");
    if (offer.ok) offers = [offer.payload];
    else Object.assign(errors, offer.errors);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const types = DEV_CLIENT_TYPES.filter((t) => form.eligibleClientTypes.includes(t));
  return {
    ok: true,
    payload: {
      advertiserId,
      name,
      ...(sponsorCategory ? { sponsorCategory } : {}),
      objective: form.objective,
      rewardType: form.rewardType,
      rewardAmountUnits: rewardAmountUnits as number,
      sponsorChargeCents: sponsorChargeCents as number,
      currency: "USD",
      ...(totalBudgetCents !== undefined ? { totalBudgetCents } : {}),
      ...(dailyBudgetCents !== undefined ? { dailyBudgetCents } : {}),
      ...(developerDailyCap !== undefined ? { developerDailyCap } : {}),
      ...(developerLifetimeCap !== undefined ? { developerLifetimeCap } : {}),
      ...(frequencyCapPerDay !== undefined ? { frequencyCapPerDay } : {}),
      eligibleClientTypes: types,
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(offers ? { offers } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export interface SpendSummary {
  spendCents: number;
  /** rewardsGranted x sponsorChargeCents: what the rewarded completions cost at the campaign's charge. */
  listPriceCents: number;
  /**
   * listPrice - spend when positive. The server still rewards a completion
   * once the sponsor's budget is used up but skips the charge (soft cap), so
   * this is what went unbilled. Zero when everything was charged.
   */
  unbilledCents: number;
  /** totalBudget - spend, floored at 0; null without a total budget. */
  remainingBudgetCents: number | null;
}

/** Pure integer reconciliation of a campaign's stats against its own pricing. */
export function summarizeSpend(c: Pick<SponsorshipCampaign, "sponsorChargeCents" | "totalBudgetCents"> & {
  stats: SponsorshipStats;
}): SpendSummary {
  const spendCents = c.stats.spendCents;
  const listPriceCents = c.stats.rewardsGranted * c.sponsorChargeCents;
  const unbilledCents = listPriceCents > spendCents ? listPriceCents - spendCents : 0;
  const remainingBudgetCents =
    c.totalBudgetCents === null ? null : Math.max(0, c.totalBudgetCents - spendCents);
  return { spendCents, listPriceCents, unbilledCents, remainingBudgetCents };
}

export function activeOfferCount(c: Pick<SponsorshipCampaign, "offers">): number {
  return c.offers.filter((o) => o.status === "ACTIVE").length;
}

/** The server refuses to submit a campaign without at least one active offer. */
export function canSubmit(c: Pick<SponsorshipCampaign, "status" | "offers">): boolean {
  return c.status === "DRAFT" && activeOfferCount(c) > 0;
}

// ---------------------------------------------------------------------------
// Loaders + actions (never throw)
// ---------------------------------------------------------------------------

type Getter = typeof apiGet;
type Poster = typeof apiPost;

export type CampaignListResult =
  | { status: "ok"; campaigns: SponsorshipCampaign[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export type CampaignActionResult =
  | { status: "ok"; campaign: SponsorshipCampaign }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

const NETWORK_ERROR = "We couldn't reach DevAds. Check your connection and try again.";

const SERVER_ERRORS: Record<string, string> = {
  advertiser_not_found: "Your advertiser account wasn't found.",
  advertiser_suspended: "Your advertiser account is suspended, so it can't create sponsorships.",
  campaign_not_found: "That sponsorship campaign no longer exists.",
  campaign_not_editable: "Only draft sponsorship campaigns can be changed.",
  campaign_not_in_draft: "Only draft sponsorship campaigns can be submitted.",
  campaign_needs_at_least_one_offer: "Add at least one active offer before submitting for review.",
  invalid_date_range: "The end date must be after the start date.",
  invalid_request: "Some of the details weren't accepted. Check the form and try again.",
};

function serverMessage(data: unknown, fallback: string): string {
  const code = isObject(data) && typeof data.error === "string" ? data.error : "";
  return SERVER_ERRORS[code] ?? fallback;
}

/** GET /api/v1/sponsorship-campaigns?advertiserId=..., the sponsor's campaigns with stats. */
export async function fetchSponsorshipCampaigns(advertiserId: string, get: Getter = apiGet): Promise<CampaignListResult> {
  try {
    const { ok, status, data } = await get<unknown>(
      `/api/v1/sponsorship-campaigns?advertiserId=${encodeURIComponent(advertiserId)}`
    );
    if (status === 401) return { status: "unauthenticated" };
    if (status === 403) return { status: "error", message: "You don't have access to this advertiser's sponsorships." };
    if (!ok) return { status: "error", message: "We couldn't load your sponsorship campaigns. Please try again." };
    if (!Array.isArray(data) || !data.every(isSponsorshipCampaign)) {
      return { status: "error", message: "Your sponsorship campaigns came back in a format we couldn't read." };
    }
    return { status: "ok", campaigns: data };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

export type CampaignDetailResult =
  | { status: "ok"; campaign: SponsorshipCampaign }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * One campaign, with stats. There is no GET-by-id route for sponsorship
 * campaigns, so this reads the sponsor's list (the only route that returns
 * stats) and picks the campaign out of it.
 */
export async function fetchSponsorshipCampaign(
  advertiserId: string,
  campaignId: string,
  get: Getter = apiGet
): Promise<CampaignDetailResult> {
  const list = await fetchSponsorshipCampaigns(advertiserId, get);
  if (list.status !== "ok") return list;
  const campaign = list.campaigns.find((c) => c.id === campaignId);
  return campaign ? { status: "ok", campaign } : { status: "not_found" };
}

async function postCampaignAction(
  path: string,
  body: unknown,
  fallback: string,
  post: Poster
): Promise<CampaignActionResult> {
  try {
    const { ok, status, data } = await post<unknown>(path, body);
    if (status === 401) return { status: "unauthenticated" };
    if (status === 403 && !(isObject(data) && data.error === "advertiser_suspended")) {
      return { status: "error", message: "You don't have access to this sponsorship campaign." };
    }
    if (!ok) return { status: "error", message: serverMessage(data, fallback) };
    if (!isSponsorshipCampaign(data)) {
      return { status: "error", message: "DevAds saved the change but returned data we couldn't read. Reload the page." };
    }
    return { status: "ok", campaign: data };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

export function createSponsorshipCampaign(payload: CreateCampaignPayload, post: Poster = apiPost) {
  return postCampaignAction(
    "/api/v1/sponsorship-campaigns",
    payload,
    "We couldn't create the sponsorship campaign. Please try again.",
    post
  );
}

export function addSponsoredOffer(campaignId: string, payload: OfferPayload, post: Poster = apiPost) {
  return postCampaignAction(
    `/api/v1/sponsorship-campaigns/${encodeURIComponent(campaignId)}/offers`,
    payload,
    "We couldn't add the offer. Please try again.",
    post
  );
}

export function submitSponsorshipCampaign(campaignId: string, post: Poster = apiPost) {
  return postCampaignAction(
    `/api/v1/sponsorship-campaigns/${encodeURIComponent(campaignId)}/submit`,
    {},
    "We couldn't submit the sponsorship campaign. Please try again.",
    post
  );
}
