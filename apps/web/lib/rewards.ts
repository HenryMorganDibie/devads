import { apiGet } from "./api";

// ---------------------------------------------------------------------------
// Developer reward wallet (sponsorship domain, Phase 4).
//
// Mirrors the shape returned by GET /api/v1/wallet (RewardWalletResponse in
// packages/shared/src/sponsorship.ts). Like the dashboard's local `Earnings`
// interface, the type is declared here rather than importing @devads/shared,
// and the response is checked structurally before it is rendered.
//
// All reward amounts are opaque INTEGER units. Nothing here divides,
// multiplies or converts them to a fractional value; formatting works on the
// integer's digits directly.
// ---------------------------------------------------------------------------

export const REWARD_TYPES = [
  "AI_CREDITS",
  "API_CREDITS",
  "COMPUTE_CREDITS",
  "TOOL_CREDITS",
  "CASH",
  "DISCOUNT",
  "SUBSCRIPTION_CREDIT",
  "OTHER",
] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

export const LEDGER_ENTRY_TYPES = ["EARNED", "REVERSED", "REDEEMED", "EXPIRED", "ADJUSTMENT"] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const REWARD_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REVERSED"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

export interface RewardBalance {
  rewardType: RewardType;
  availableUnits: number;
  pendingUnits: number;
  ledgerAvailableUnits: number;
}

export interface RewardLedgerEntry {
  id: string;
  rewardType: RewardType;
  campaignId: string;
  entryType: LedgerEntryType;
  amountUnits: number;
  status: RewardStatus;
  createdAt: string;
}

export interface RewardWalletResponse {
  developerId: string;
  balances: RewardBalance[];
  recentLedger: RewardLedgerEntry[];
}

/**
 * The server returns at most this many ledger rows (`take: 50` in
 * services/ad-server/src/routes/sponsorships.ts). There is no pagination
 * parameter, so anything derived from the ledger (the monthly summary, the
 * history table) can only see this window.
 */
export const RECENT_LEDGER_LIMIT = 50;

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

export function rewardTypeLabel(type: string): string {
  return (REWARD_LABELS as Record<string, string>)[type] ?? "Reward";
}

const ENTRY_LABELS: Record<LedgerEntryType, string> = {
  EARNED: "Earned",
  REVERSED: "Reversed",
  REDEEMED: "Redeemed",
  EXPIRED: "Expired",
  ADJUSTMENT: "Adjustment",
};

export function ledgerEntryLabel(type: LedgerEntryType): string {
  return ENTRY_LABELS[type];
}

const STATUS_LABELS: Record<RewardStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
};

export function rewardStatusLabel(status: RewardStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Groups an integer's digits with commas ("1240" -> "1,240") without any
 * float arithmetic or locale dependence. Non-integers are never expected
 * (the response check rejects them) and are returned unformatted.
 */
export function formatUnits(units: number): string {
  if (!Number.isSafeInteger(units)) return String(units);
  const negative = units < 0;
  const digits = String(negative ? -units : units);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

/**
 * Direction of a ledger entry, matching how the server's ledger-derived
 * balance treats it: EARNED and ADJUSTMENT credit, REVERSED / REDEEMED /
 * EXPIRED debit. Amounts are stored non-negative (DB CHECK constraint).
 */
export function ledgerEntrySign(type: LedgerEntryType): 1 | -1 {
  return type === "EARNED" || type === "ADJUSTMENT" ? 1 : -1;
}

/** "+50" / "-400", from the integer amount and the entry type's direction. */
export function formatSignedUnits(entry: Pick<RewardLedgerEntry, "entryType" | "amountUnits">): string {
  return `${ledgerEntrySign(entry.entryType) === 1 ? "+" : "-"}${formatUnits(entry.amountUnits)}`;
}

/** YYYY-MM-DD in UTC (the server's caps and days are UTC too). */
export function formatLedgerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toISOString().slice(0, 10);
}

function isSameUtcMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export interface MonthSummary {
  earned: number;
  redeemed: number;
  reversed: number;
  expired: number;
  adjusted: number;
}

function emptyMonth(): MonthSummary {
  return { earned: 0, redeemed: 0, reversed: 0, expired: 0, adjusted: 0 };
}

export interface RewardCardView {
  rewardType: RewardType;
  label: string;
  availableUnits: number;
  pendingUnits: number;
  /** True when the cached wallet balance disagrees with the ledger-derived balance. */
  balanceMismatch: boolean;
  thisMonth: MonthSummary;
}

export interface WalletView {
  cards: RewardCardView[];
  history: RewardLedgerEntry[];
  /**
   * True when the server returned a full ledger window whose oldest row is
   * still in the current month, so older rows this month may exist that the
   * API did not return. The monthly totals are then lower bounds.
   */
  monthSummaryMayBeIncomplete: boolean;
  isEmpty: boolean;
}

/**
 * Pure: turns the wallet response into per-reward-type cards plus history.
 *
 * "This month" is the current UTC calendar month and is summed from the
 * returned ledger window only. Earned counts EARNED rows that were not
 * rejected or reversed (pending earnings included, since they were earned).
 */
export function buildWalletView(wallet: RewardWalletResponse, now: Date): WalletView {
  const months = new Map<RewardType, MonthSummary>();
  for (const e of wallet.recentLedger) {
    if (!isSameUtcMonth(e.createdAt, now)) continue;
    const m = months.get(e.rewardType) ?? emptyMonth();
    switch (e.entryType) {
      case "EARNED":
        if (e.status === "APPROVED" || e.status === "PENDING") m.earned += e.amountUnits;
        break;
      case "REDEEMED":
        m.redeemed += e.amountUnits;
        break;
      case "REVERSED":
        m.reversed += e.amountUnits;
        break;
      case "EXPIRED":
        m.expired += e.amountUnits;
        break;
      case "ADJUSTMENT":
        m.adjusted += e.amountUnits;
        break;
    }
    months.set(e.rewardType, m);
  }

  const byType = new Map<RewardType, RewardBalance>();
  for (const b of wallet.balances) byType.set(b.rewardType, b);
  // A reward type can appear in the ledger without a balance row (e.g. only
  // rejected earnings); still give it a card so its history has a home.
  const types = new Set<RewardType>([...byType.keys(), ...months.keys()]);

  const cards = [...types].sort().map((rewardType) => {
    const b = byType.get(rewardType);
    const availableUnits = b?.availableUnits ?? 0;
    return {
      rewardType,
      label: rewardTypeLabel(rewardType),
      availableUnits,
      pendingUnits: b?.pendingUnits ?? 0,
      balanceMismatch: b ? b.availableUnits !== b.ledgerAvailableUnits : false,
      thisMonth: months.get(rewardType) ?? emptyMonth(),
    };
  });

  const ledger = wallet.recentLedger;
  const oldest = ledger[ledger.length - 1];
  const monthSummaryMayBeIncomplete =
    ledger.length >= RECENT_LEDGER_LIMIT && oldest !== undefined && isSameUtcMonth(oldest.createdAt, now);

  return {
    cards,
    history: ledger,
    monthSummaryMayBeIncomplete,
    isEmpty: cards.length === 0 && ledger.length === 0,
  };
}

/** e.g. "+680 earned  -400 redeemed", plus reversed/expired/adjusted only when non-zero. */
export function formatMonthSummary(m: MonthSummary): string {
  const parts = [`+${formatUnits(m.earned)} earned`, `-${formatUnits(m.redeemed)} redeemed`];
  if (m.reversed > 0) parts.push(`-${formatUnits(m.reversed)} reversed`);
  if (m.expired > 0) parts.push(`-${formatUnits(m.expired)} expired`);
  if (m.adjusted > 0) parts.push(`+${formatUnits(m.adjusted)} adjusted`);
  return parts.join("  ");
}

// ---------------------------------------------------------------------------
// Response check + loader
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isUnits(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

/** Structural check: rejects missing fields, unknown enums and non-integer units. */
export function isRewardWalletResponse(v: unknown): v is RewardWalletResponse {
  if (!isObject(v) || typeof v.developerId !== "string") return false;
  if (!Array.isArray(v.balances) || !Array.isArray(v.recentLedger)) return false;
  const balancesOk = v.balances.every(
    (b) =>
      isObject(b) &&
      isOneOf(REWARD_TYPES, b.rewardType) &&
      isUnits(b.availableUnits) &&
      isUnits(b.pendingUnits) &&
      isUnits(b.ledgerAvailableUnits)
  );
  const ledgerOk = v.recentLedger.every(
    (e) =>
      isObject(e) &&
      typeof e.id === "string" &&
      typeof e.campaignId === "string" &&
      typeof e.createdAt === "string" &&
      isOneOf(REWARD_TYPES, e.rewardType) &&
      isOneOf(LEDGER_ENTRY_TYPES, e.entryType) &&
      isOneOf(REWARD_STATUSES, e.status) &&
      isUnits(e.amountUnits)
  );
  return balancesOk && ledgerOk;
}

export type WalletLoadResult =
  | { status: "ok"; wallet: RewardWalletResponse }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type Getter = typeof apiGet;

/**
 * Loads the wallet exactly the way the dashboard loads earnings: the shared
 * `apiGet` helper (bearer token from the stored session) with the session's
 * developerId as a query parameter. Never throws.
 */
export async function fetchRewardWallet(developerId: string, get: Getter = apiGet): Promise<WalletLoadResult> {
  try {
    const { ok, status, data } = await get<unknown>(`/api/v1/wallet?developerId=${encodeURIComponent(developerId)}`);
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) return { status: "error", message: "We couldn't load your reward wallet. Please try again." };
    if (!isRewardWalletResponse(data)) {
      return { status: "error", message: "The reward wallet returned data we couldn't read." };
    }
    return { status: "ok", wallet: data };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again." };
  }
}
