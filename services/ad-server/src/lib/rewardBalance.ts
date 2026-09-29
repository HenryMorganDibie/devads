/**
 * The one definition of a reward balance, derived from the ledger (the
 * source of truth). The wallet read and the redemption balance check both
 * use it, so what a developer sees is exactly what they can redeem.
 *
 *  - EARNED or ADJUSTMENT with status APPROVED: credit.
 *  - EARNED with status PENDING: pending (not spendable).
 *  - REVERSED, REDEEMED, EXPIRED: debit, whatever their status. A redemption
 *    that fails keeps its REDEEMED debit and gains a compensating APPROVED
 *    ADJUSTMENT credit, so the ledger stays append-only.
 */

export interface LedgerGroup {
  rewardType: string;
  entryType: string;
  status: string;
  _sum: { amountUnits: number | null };
}

export interface LedgerBalances {
  available: Map<string, number>;
  pending: Map<string, number>;
}

export function balancesFromLedgerGroups(groups: readonly LedgerGroup[]): LedgerBalances {
  const available = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const row of groups) {
    const units = row._sum.amountUnits ?? 0;
    const key = row.rewardType;
    if ((row.entryType === "EARNED" || row.entryType === "ADJUSTMENT") && row.status === "APPROVED") {
      available.set(key, (available.get(key) ?? 0) + units);
    } else if (row.entryType === "EARNED" && row.status === "PENDING") {
      pending.set(key, (pending.get(key) ?? 0) + units);
    } else if (row.entryType === "REVERSED" || row.entryType === "REDEEMED" || row.entryType === "EXPIRED") {
      available.set(key, (available.get(key) ?? 0) - units);
    }
  }
  return { available, pending };
}

/** Advisory-lock key serializing wallet reads and redemptions for one developer (distinct from payouts). */
export function rewardWalletLockKey(developerId: string): string {
  return `reward-wallet:${developerId}`;
}
