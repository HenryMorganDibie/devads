import { apiGet, apiPost } from "./api";
import { REWARD_TYPES, type AdminActionResult, type RewardType } from "./sponsorships";

// ---------------------------------------------------------------------------
// Reward redemptions (sponsorship Phase 7), admin side.
//
// Mirrors GET /api/v1/admin/redemptions and the complete / fail actions
// (AdminRedemptionListResponse in packages/shared/src/sponsorship.ts).
// Operators settle redemptions the provider left open; the MANUAL provider
// leaves every redemption PENDING for an operator to fulfil out of band.
// Failing one returns the developer's units (the server appends the
// compensating ledger credit), so the fail action always asks for a reason.
// ---------------------------------------------------------------------------

export const REDEMPTION_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export interface AdminRedemption {
  id: string;
  developerId: string;
  rewardType: RewardType;
  amountUnits: number;
  provider: string;
  status: RedemptionStatus;
  providerRef: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function isOpenRedemption(r: Pick<AdminRedemption, "status">): boolean {
  return r.status === "PENDING" || r.status === "PROCESSING";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

const nullableString = (v: unknown) => v === null || typeof v === "string";

export function isAdminRedemption(v: unknown): v is AdminRedemption {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.developerId === "string" &&
    isOneOf(REWARD_TYPES, v.rewardType) &&
    typeof v.amountUnits === "number" &&
    Number.isSafeInteger(v.amountUnits) &&
    v.amountUnits > 0 &&
    typeof v.provider === "string" &&
    isOneOf(REDEMPTION_STATUSES, v.status) &&
    nullableString(v.providerRef) &&
    nullableString(v.failureReason) &&
    typeof v.createdAt === "string" &&
    nullableString(v.completedAt)
  );
}

export type AdminRedemptionsResult =
  | { status: "ok"; redemptions: AdminRedemption[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type Getter = typeof apiGet;
type Poster = typeof apiPost;

const NETWORK_ERROR = "We couldn't reach DevAds. Check your connection and try again.";

/** Oldest first, so the longest-waiting request is at the top. Never throws. */
export async function fetchAdminRedemptions(status: RedemptionStatus | null, get: Getter = apiGet): Promise<AdminRedemptionsResult> {
  try {
    const { ok, status: http, data } = await get<unknown>(`/api/v1/admin/redemptions${status ? `?status=${status}` : ""}`);
    if (http === 401 || http === 403) return { status: "unauthenticated" };
    const rows = isObject(data) ? data.redemptions : undefined;
    if (!ok || !Array.isArray(rows) || !rows.every(isAdminRedemption)) {
      return { status: "error", message: "We couldn't load redemptions." };
    }
    return { status: "ok", redemptions: rows };
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }
}

const ACTION_ERRORS: Record<string, string> = {
  redemption_not_found: "That redemption no longer exists.",
  redemption_not_open: "That redemption was already settled.",
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

const base = (id: string) => `/api/v1/admin/redemptions/${encodeURIComponent(id)}`;

/** Marks a redemption delivered. The reference is an internal fulfilment id, never the reward itself (e.g. not a code). */
export function completeRedemption(id: string, providerRef: string | null, post: Poster = apiPost) {
  return postAction(`${base(id)}/complete`, providerRef ? { providerRef } : {}, "We couldn't complete the redemption.", post);
}

/** Marks a redemption failed; the server returns the units to the developer. */
export function failRedemption(id: string, reason: string, post: Poster = apiPost) {
  return postAction(`${base(id)}/fail`, { reason }, "We couldn't fail the redemption.", post);
}

export function validateFulfilmentRef(input: string): { ok: true; ref: string | null } | { ok: false; message: string } {
  const ref = input.trim();
  if (ref.length === 0) return { ok: true, ref: null };
  if (ref.length > 200) return { ok: false, message: "Keep the reference under 200 characters." };
  return { ok: true, ref };
}

export function validateFailReason(input: string): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = input.trim();
  if (reason.length === 0) return { ok: false, message: "A reason is required to fail a redemption." };
  if (reason.length > 200) return { ok: false, message: "Keep the reason under 200 characters." };
  return { ok: true, reason };
}
