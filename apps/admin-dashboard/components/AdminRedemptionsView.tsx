import Link from "next/link";
import { isOpenRedemption, type AdminRedemptionsResult, type RedemptionStatus } from "../lib/redemptions";

export type AdminRedemptionsState = { status: "loading" } | AdminRedemptionsResult;

const STATUS_FILTERS: Array<{ value: RedemptionStatus | null; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: null, label: "All" },
];

function formatUtc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Presentational: the redemption queue with complete / fail actions on open rows. */
export function AdminRedemptionsView({
  state,
  filter,
  onFilter,
  onRetry,
  actionError,
  busyId,
  onComplete,
  onFail,
}: {
  state: AdminRedemptionsState;
  filter: RedemptionStatus | null;
  onFilter: (status: RedemptionStatus | null) => void;
  onRetry?: () => void;
  actionError?: string | null;
  busyId?: string | null;
  onComplete: (id: string) => void;
  onFail: (id: string) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6 text-sm" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            className={filter === f.value ? "btn-primary text-sm" : "text-muted hover:text-white px-3 py-1"}
            onClick={() => onFilter(f.value)}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && (
        <p className="text-sm text-red-400 mb-4" role="alert">
          {actionError}
        </p>
      )}

      {state.status === "loading" && <p className="text-sm text-muted">Loading redemptions...</p>}
      {state.status === "unauthenticated" && (
        <p className="text-sm">
          Your admin session has expired.{" "}
          <Link href="/login" className="text-accent">
            Sign in
          </Link>{" "}
          again to settle redemptions.
        </p>
      )}
      {state.status === "error" && (
        <div className="text-sm" role="alert">
          <p className="mb-3">{state.message}</p>
          {onRetry && (
            <button className="btn-primary text-sm" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {state.status === "ok" &&
        (state.redemptions.length === 0 ? (
          <p className="text-sm text-muted">No redemptions with this status.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted text-left">
                <tr>
                  <th className="font-normal pb-2">Requested</th>
                  <th className="font-normal pb-2">Developer</th>
                  <th className="font-normal pb-2">Reward</th>
                  <th className="font-normal pb-2 text-right">Units</th>
                  <th className="font-normal pb-2 pl-4">Provider</th>
                  <th className="font-normal pb-2 pl-4">Status</th>
                  <th className="font-normal pb-2 pl-4">Reference / reason</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {state.redemptions.map((r) => (
                  <tr key={r.id} className="border-t border-white/5" data-redemption-id={r.id}>
                    <td className="py-2">{formatUtc(r.createdAt)}</td>
                    <td className="py-2 font-mono text-xs">{r.developerId}</td>
                    <td className="py-2">{r.rewardType}</td>
                    <td className="py-2 text-right font-mono">{r.amountUnits}</td>
                    <td className="py-2 pl-4">{r.provider}</td>
                    <td className="py-2 pl-4">{r.status}</td>
                    <td className="py-2 pl-4 text-xs">{r.status === "FAILED" ? r.failureReason : r.providerRef ?? ""}</td>
                    <td className="py-2 pl-4 whitespace-nowrap">
                      {isOpenRedemption(r) && (
                        <>
                          <button className="btn-primary text-xs mr-2" disabled={busyId === r.id} onClick={() => onComplete(r.id)}>
                            Mark delivered
                          </button>
                          <button className="text-xs text-red-400 hover:underline" disabled={busyId === r.id} onClick={() => onFail(r.id)}>
                            Fail and refund
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
