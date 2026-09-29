"use client";

import { useState } from "react";
import { formatLedgerDate, formatUnits, rewardTypeLabel, type RewardType } from "../lib/rewards";
import {
  describeRedemptionOutcome,
  newIdempotencyKey,
  parseRedeemAmount,
  redemptionStatusLabel,
  type RedeemResult,
  type RedemptionsLoadResult,
} from "../lib/redemptions";

export type RedemptionsPanelState = { status: "loading" } | RedemptionsLoadResult;

export interface RedeemableBalance {
  rewardType: RewardType;
  availableUnits: number;
}

/**
 * Redeem form plus redemption history. Only offered when the server reports
 * redemption enabled, and only for reward types the configured provider
 * supports and the developer has a balance in. The amount is checked here
 * for usability; the server is the authority on the balance.
 */
export function RedemptionPanel({
  state,
  balances,
  onRedeem,
  onRedeemed,
}: {
  state: RedemptionsPanelState;
  balances: RedeemableBalance[];
  onRedeem: (rewardType: RewardType, amountUnits: number, idempotencyKey: string) => Promise<RedeemResult>;
  onRedeemed?: () => void;
}) {
  const [rewardType, setRewardType] = useState<RewardType | "">("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // One key per attempt: kept across a retry after a network failure, replaced after any answer.
  const [attemptKey, setAttemptKey] = useState<string | null>(null);

  if (state.status === "loading") return <p className="text-muted text-sm">Loading redemptions...</p>;
  if (state.status !== "ok") return null;

  const { redemptionEnabled, redeemableRewardTypes, redemptions } = state.data;
  const options = balances.filter((b) => redeemableRewardTypes.includes(b.rewardType) && b.availableUnits > 0);
  const selected = options.find((o) => o.rewardType === rewardType) ?? options[0];

  if (!redemptionEnabled && redemptions.length === 0) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || submitting) return;
    const parsed = parseRedeemAmount(amount, selected.availableUnits);
    if (!parsed.ok) {
      setMessage({ kind: "error", text: parsed.message });
      return;
    }
    const key = attemptKey ?? newIdempotencyKey();
    setAttemptKey(key);
    setSubmitting(true);
    setMessage(null);
    const result = await onRedeem(selected.rewardType, parsed.units, key);
    setSubmitting(false);
    if (result.status === "ok") {
      setAttemptKey(null);
      setAmount("");
      setMessage({ kind: "ok", text: describeRedemptionOutcome(result.redemption) });
      onRedeemed?.();
    } else if (result.status === "unauthenticated") {
      setAttemptKey(null);
      setMessage({ kind: "error", text: "Your session has expired. Sign in again to redeem." });
    } else {
      if (!result.retryable) setAttemptKey(null);
      setMessage({ kind: "error", text: result.message });
    }
  }

  return (
    <section className="card p-6 mb-10">
      <h2 className="font-medium mb-2">Redeem rewards</h2>
      {redemptionEnabled ? (
        options.length > 0 ? (
          <form className="flex flex-wrap items-end gap-3 mb-3" onSubmit={submit}>
            <label className="text-sm">
              <span className="block text-muted mb-1">Reward</span>
              <select
                className="input"
                value={selected?.rewardType ?? ""}
                onChange={(e) => setRewardType(e.target.value as RewardType)}
                disabled={submitting}
              >
                {options.map((o) => (
                  <option key={o.rewardType} value={o.rewardType}>
                    {rewardTypeLabel(o.rewardType)} ({formatUnits(o.availableUnits)} available)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-muted mb-1">Units</span>
              <input
                className="input w-32"
                inputMode="numeric"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAttemptKey(null);
                }}
                disabled={submitting}
                aria-label="Units to redeem"
              />
            </label>
            <button className="btn-primary text-sm" type="submit" disabled={submitting}>
              {submitting ? "Redeeming..." : "Redeem"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted mb-3">You have no available units that can be redeemed yet.</p>
        )
      ) : (
        <p className="text-sm text-muted mb-3">Redeeming rewards isn&apos;t available right now.</p>
      )}
      {message && (
        <p className={`text-sm mb-3 ${message.kind === "error" ? "text-red-400" : ""}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
      <p className="text-xs text-muted mb-4">
        DevAds fulfils redemptions. Units are reserved as soon as you redeem; if a redemption can&apos;t be
        completed, they are returned to your balance.
      </p>

      {redemptions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="font-normal pb-2">Date (UTC)</th>
                <th className="font-normal pb-2">Reward</th>
                <th className="font-normal pb-2 text-right">Units</th>
                <th className="font-normal pb-2 pl-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((r) => (
                <tr key={r.id} className="border-t border-white/5" data-redemption-status={r.status}>
                  <td className="py-2">{formatLedgerDate(r.createdAt)}</td>
                  <td className="py-2">{rewardTypeLabel(r.rewardType)}</td>
                  <td className="py-2 text-right font-mono">{formatUnits(r.amountUnits)}</td>
                  <td className="py-2 pl-4">{redemptionStatusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
