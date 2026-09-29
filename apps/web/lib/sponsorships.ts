import { apiGet } from "./api";
import { REWARD_TYPES, type RewardType } from "./rewards";

// ---------------------------------------------------------------------------
// Developer-facing sponsorship status and active-offer listing.
//
// The opt-in: Phase 1 reuses DeveloperProfile.adsEnabled as the single "show
// me sponsored content" switch, read through the existing
// GET /api/v1/developers/:id/preferences route (the same call the dashboard
// makes).
//
// The list of active sponsorships comes from GET /api/v1/sponsorships/offers,
// a read-only listing: it records no SponsorshipEvent, spends no display cap
// and doesn't count toward sponsor display stats. This page still never calls
// GET /api/v1/sponsorships/offer (singular). That route is the selection
// call the VS Code extension uses: every non-null response records a
// server-authoritative OFFER_DISPLAYED and spends a display cap.
//
// Like lib/rewards.ts, response types are declared here (mirroring
// SponsoredOfferListResponse in packages/shared/src/sponsorship.ts) and the
// response is checked structurally before it is rendered.
// ---------------------------------------------------------------------------

export type SponsorshipStatusResult =
  | { status: "ok"; sponsoredContentEnabled: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type Getter = typeof apiGet;

export async function fetchSponsorshipStatus(developerId: string, get: Getter = apiGet): Promise<SponsorshipStatusResult> {
  try {
    const { ok, status, data } = await get<unknown>(
      `/api/v1/developers/${encodeURIComponent(developerId)}/preferences`
    );
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) return { status: "error", message: "We couldn't load your sponsorship settings. Please try again." };
    const enabled = (data as { adsEnabled?: unknown } | null)?.adsEnabled;
    if (typeof enabled !== "boolean") {
      return { status: "error", message: "Your sponsorship settings came back in a format we couldn't read." };
    }
    return { status: "ok", sponsoredContentEnabled: enabled };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again." };
  }
}

// ---------------------------------------------------------------------------
// Active sponsorships (read-only listing)
// ---------------------------------------------------------------------------

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
] as const;
export type DevClientType = (typeof DEV_CLIENT_TYPES)[number];

/** Client types a developer can actually receive offers in today (the VS Code extension only). */
export const SUPPORTED_CLIENT_TYPES: readonly DevClientType[] = ["VS_CODE"];

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
};

export function clientTypeLabel(type: DevClientType): string {
  return CLIENT_LABELS[type];
}

export interface ActiveSponsorship {
  offerId: string;
  campaignId: string;
  title: string;
  description: string;
  ctaUrl: string;
  requiredAction: string | null;
  rewardType: RewardType;
  rewardAmountUnits: number;
  expiresAt: string | null;
  /** Empty = every client type. */
  eligibleClientTypes: DevClientType[];
}

export interface ActiveSponsorshipsResponse {
  sponsoredContentEnabled: boolean;
  offers: ActiveSponsorship[];
}

/** "VS Code, Cursor", or "Any connected tool" when the offer isn't restricted. */
export function formatEligibleClients(types: readonly DevClientType[]): string {
  if (types.length === 0) return "Any connected tool";
  return types.map(clientTypeLabel).join(", ");
}

/** True when the offer can be received in at least one tool DevAds supports today. */
export function isReceivableToday(offer: Pick<ActiveSponsorship, "eligibleClientTypes">): boolean {
  if (offer.eligibleClientTypes.length === 0) return true;
  return offer.eligibleClientTypes.some((t) => SUPPORTED_CLIENT_TYPES.includes(t));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/** Structural check: rejects missing fields, unknown enums and non-integer reward units. */
export function isActiveSponsorshipsResponse(v: unknown): v is ActiveSponsorshipsResponse {
  if (!isObject(v) || typeof v.sponsoredContentEnabled !== "boolean" || !Array.isArray(v.offers)) return false;
  return v.offers.every(
    (o) =>
      isObject(o) &&
      typeof o.offerId === "string" &&
      typeof o.campaignId === "string" &&
      typeof o.title === "string" &&
      typeof o.description === "string" &&
      typeof o.ctaUrl === "string" &&
      isNullableString(o.requiredAction) &&
      isNullableString(o.expiresAt) &&
      isOneOf(REWARD_TYPES, o.rewardType) &&
      typeof o.rewardAmountUnits === "number" &&
      Number.isSafeInteger(o.rewardAmountUnits) &&
      Array.isArray(o.eligibleClientTypes) &&
      o.eligibleClientTypes.every((t) => isOneOf(DEV_CLIENT_TYPES, t))
  );
}

export type ActiveSponsorshipsResult =
  | { status: "ok"; sponsoredContentEnabled: boolean; offers: ActiveSponsorship[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Loads the active sponsorships the signed-in developer is eligible for.
 * No clientType is sent: the web isn't a client that serves offers, so it
 * lists offers for every tool and shows where each one can be received.
 * Never throws.
 */
export async function fetchActiveSponsorships(get: Getter = apiGet): Promise<ActiveSponsorshipsResult> {
  try {
    const { ok, status, data } = await get<unknown>("/api/v1/sponsorships/offers");
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) return { status: "error", message: "We couldn't load active sponsorships. Please try again." };
    if (!isActiveSponsorshipsResponse(data)) {
      return { status: "error", message: "Active sponsorships came back in a format we couldn't read." };
    }
    return { status: "ok", sponsoredContentEnabled: data.sponsoredContentEnabled, offers: data.offers };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again." };
  }
}
