import { apiGet, apiPost } from "./api";
import { REWARD_TYPES, type RewardType } from "./rewards";

// ---------------------------------------------------------------------------
// Reward redemption (sponsorship Phase 7).
//
// Mirrors GET/POST /api/v1/wallet/redemptions (RewardRedemptionListResponse
// and RedeemRewardResponse in packages/shared/src/sponsorship.ts). Declared
// locally and checked structurally, like lib/rewards.ts. The page sends only
// the reward type, an integer amount and an idempotency key; the server
// checks the balance, picks the provider and decides the outcome.
// ---------------------------------------------------------------------------

export const REDEMPTION_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export interface RewardRedemption {
  id: string;
  rewardType: RewardType;
  amountUnits: number;
  provider: string;
  status: RedemptionStatus;
  providerRef: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RedemptionListResponse {
  redemptionEnabled: boolean;
  redeemableRewardTypes: RewardType[];
  redemptions: RewardRedemption[];
}

const STATUS_LABELS: Record<RedemptionStatus, string> = {
  PENDING: "Requested",
  PROCESSING: "Processing",
  COMPLETED: "Delivered",
  FAILED: "Failed, units returned",
};

export function redemptionStatusLabel(status: RedemptionStatus): string {
  return STATUS_LABELS[status];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

const isNullableString = (v: unknown) => v === null || typeof v === "string";

export function isRewardRedemption(v: unknown): v is RewardRedemption {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    isOneOf(REWARD_TYPES, v.rewardType) &&
    typeof v.amountUnits === "number" &&
    Number.isSafeInteger(v.amountUnits) &&
    v.amountUnits > 0 &&
    typeof v.provider === "string" &&
    isOneOf(REDEMPTION_STATUSES, v.status) &&
    isNullableString(v.providerRef) &&
    isNullableString(v.failureReason) &&
    typeof v.createdAt === "string" &&
    isNullableString(v.completedAt)
  );
}

export function isRedemptionListResponse(v: unknown): v is RedemptionListResponse {
  return (
    isObject(v) &&
    typeof v.redemptionEnabled === "boolean" &&
    Array.isArray(v.redeemableRewardTypes) &&
    v.redeemableRewardTypes.every((t) => isOneOf(REWARD_TYPES, t)) &&
    Array.isArray(v.redemptions) &&
    v.redemptions.every(isRewardRedemption)
  );
}

export type RedemptionsLoadResult =
  | { status: "ok"; data: RedemptionListResponse }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type Getter = typeof apiGet;
type Poster = typeof apiPost;

/** Never throws. */
export async function fetchRedemptions(developerId: string, get: Getter = apiGet): Promise<RedemptionsLoadResult> {
  try {
    const { ok, status, data } = await get<unknown>(`/api/v1/wallet/redemptions?developerId=${encodeURIComponent(developerId)}`);
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok || !isRedemptionListResponse(data)) {
      return { status: "error", message: "We couldn't load your redemptions." };
    }
    return { status: "ok", data };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again." };
  }
}

/**
 * Parses the amount field. Only whole, positive numbers of units up to the
 * available balance are accepted; the server re-checks the balance anyway.
 */
export function parseRedeemAmount(raw: string, availableUnits: number): { ok: true; units: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: "Enter a whole number of units." };
  const units = Number(trimmed);
  if (!Number.isSafeInteger(units) || units <= 0) return { ok: false, message: "Enter a whole number of units." };
  if (units > availableUnits) return { ok: false, message: "That's more than your available balance." };
  return { ok: true, units };
}

const REFUSAL_MESSAGES: Record<string, string> = {
  insufficient_balance: "That's more than your available balance.",
  redemption_disabled: "Redeeming rewards isn't available yet.",
  reward_type_not_redeemable: "This reward type can't be redeemed yet.",
  idempotency_key_reused: "Something went wrong with that request. Please try again.",
  wallet_reconciliation_required: "Your balance is being reconciled. Please try again later.",
  redemption_in_progress: "That redemption is already being processed.",
};

export type RedeemResult =
  | { status: "ok"; redemption: RewardRedemption }
  | { status: "unauthenticated" }
  | { status: "error"; message: string; retryable: boolean };

/**
 * Submits one redemption. Never throws. The caller keeps `idempotencyKey`
 * for the lifetime of one attempt, so a retry after a network failure
 * cannot redeem twice.
 */
export async function requestRedemption(
  input: { developerId: string; rewardType: RewardType; amountUnits: number; idempotencyKey: string },
  post: Poster = apiPost
): Promise<RedeemResult> {
  try {
    const { ok, status, data } = await post<unknown>("/api/v1/wallet/redemptions", input);
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) {
      const code = isObject(data) && typeof data.error === "string" ? data.error : "";
      if (status === 429) return { status: "error", message: "Too many requests. Please wait a minute.", retryable: true };
      return { status: "error", message: REFUSAL_MESSAGES[code] ?? "We couldn't redeem your reward.", retryable: false };
    }
    const redemption = isObject(data) ? data.redemption : undefined;
    if (!isRewardRedemption(redemption)) {
      return { status: "error", message: "The redemption returned data we couldn't read.", retryable: false };
    }
    return { status: "ok", redemption };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again.", retryable: true };
  }
}

/** User-facing summary of a finished request. */
export function describeRedemptionOutcome(r: RewardRedemption): string {
  switch (r.status) {
    case "COMPLETED":
      return "Redeemed. Your reward has been delivered.";
    case "PENDING":
    case "PROCESSING":
      return "Requested. The units are reserved while your reward is fulfilled.";
    case "FAILED":
      return "The redemption couldn't be completed, and your units were returned.";
  }
}

export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
