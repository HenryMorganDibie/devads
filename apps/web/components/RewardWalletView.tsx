import Link from "next/link";
import {
  buildWalletView,
  formatLedgerDate,
  formatMonthSummary,
  formatSignedUnits,
  formatUnits,
  ledgerEntryLabel,
  rewardStatusLabel,
  rewardTypeLabel,
  type WalletLoadResult,
} from "../lib/rewards";

export type WalletPageState = { status: "loading" } | WalletLoadResult;

/** Presentational: renders every wallet state (loading, signed out, error, empty, populated). */
export function RewardWalletView({
  state,
  now,
  onRetry,
  redemptionEnabled = false,
  children,
}: {
  state: WalletPageState;
  now: Date;
  onRetry?: () => void;
  /** True only when the server reported redemption enabled. */
  redemptionEnabled?: boolean;
  /** Rendered between the balances and the history (the redemption panel). */
  children?: React.ReactNode;
}) {
  if (state.status === "loading") {
    return <p className="text-muted">Loading your reward wallet...</p>;
  }

  if (state.status === "unauthenticated") {
    return (
      <div className="card p-6 text-sm">
        <p className="mb-3">Your session has expired. Sign in again to see your reward wallet.</p>
        <Link href="/login" className="text-accent">
          Sign in
        </Link>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="card p-6 text-sm" role="alert">
        <p className="mb-3">{state.message}</p>
        {onRetry && (
          <button className="btn-primary text-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const view = buildWalletView(state.wallet, now);

  if (view.isEmpty) {
    return (
      <div className="card p-6 text-sm">
        <h2 className="font-medium mb-2">No rewards yet</h2>
        <p className="text-muted mb-3">
          Rewards come from sponsored offers you choose to complete in a connected tool (today, the
          DevAds VS Code extension). When you earn one, it shows up here with its full history.
        </p>
        <Link href="/sponsorships" className="text-accent">
          How sponsorships work
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {view.cards.map((card) => (
          <div key={card.rewardType} className="card p-5" data-reward-type={card.rewardType}>
            <h2 className="font-medium mb-3">{card.label}</h2>
            <p className="text-sm">
              <span className="text-muted">Available:</span>{" "}
              <span className="text-lg font-semibold">{formatUnits(card.availableUnits)}</span>
              <span className="inline-block w-6" />
              <span className="text-muted">Pending:</span> <span>{formatUnits(card.pendingUnits)}</span>
            </p>
            <p className="text-xs text-muted mt-2">
              This month: <span className="whitespace-pre">{formatMonthSummary(card.thisMonth)}</span>
            </p>
            {card.balanceMismatch && (
              <p className="text-xs text-yellow-400/80 mt-2">
                This balance is still being reconciled with your reward history.
              </p>
            )}
          </div>
        ))}
      </section>

      <p className="text-xs text-muted mb-10">
        Amounts are reward units granted by sponsors, separate from your ad earnings. Pending units are
        not yet available. &quot;This month&quot; is the current calendar month in UTC.
        {view.monthSummaryMayBeIncomplete &&
          ` Monthly totals only include your ${view.history.length} most recent entries, so they may be higher.`}{" "}
        {redemptionEnabled ? "You can redeem available units below." : "Redeeming rewards isn't available yet."}
      </p>

      {children}

      <section className="card p-6">
        <h2 className="font-medium mb-4">Reward history</h2>
        {view.history.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted text-left">
                  <tr>
                    <th className="font-normal pb-2">Date (UTC)</th>
                    <th className="font-normal pb-2">Reward</th>
                    <th className="font-normal pb-2">Entry</th>
                    <th className="font-normal pb-2 text-right">Amount</th>
                    <th className="font-normal pb-2 pl-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.history.map((e) => (
                    <tr key={e.id} className="border-t border-white/5">
                      <td className="py-2">{formatLedgerDate(e.createdAt)}</td>
                      <td className="py-2">{rewardTypeLabel(e.rewardType)}</td>
                      <td className="py-2">{ledgerEntryLabel(e.entryType)}</td>
                      <td className="py-2 text-right font-mono">{formatSignedUnits(e)}</td>
                      <td className="py-2 pl-4">{rewardStatusLabel(e.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-3">Showing your most recent entries.</p>
          </>
        ) : (
          <p className="text-sm text-muted">No reward history yet.</p>
        )}
      </section>
    </>
  );
}
