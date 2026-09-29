import type { ReactNode } from "react";
import Link from "next/link";
import {
  formatClientTypes,
  formatDate,
  formatMoneyCents,
  formatUnits,
  objectiveLabel,
  rewardTypeLabel,
  splitReviewQueue,
  type AdminSponsorshipCampaign,
  type AdminSponsorshipListResult,
} from "../lib/sponsorships";

export type AdminSponsorshipsState = { status: "loading" } | AdminSponsorshipListResult;

export interface AdminSponsorshipActions {
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onPause?: (id: string) => void;
  onViewActivity?: (id: string) => void;
  busyId?: string | null;
  /** Id of the campaign whose activity is open, if any. */
  activityCampaignId?: string | null;
}

function cap(n: number | null): string {
  return n === null ? "none" : formatUnits(n);
}

function money(n: number | null, currency: string): string {
  return n === null ? "none" : formatMoneyCents(n, currency);
}

/** Sponsor name when the server sent it, always followed by the advertiser id. */
function Advertiser({ c }: { c: AdminSponsorshipCampaign }) {
  return (
    <>
      {c.advertiserName && <span>{c.advertiserName} </span>}
      <span className="font-mono text-xs">{c.advertiserId}</span>
    </>
  );
}

function statsLine(c: AdminSponsorshipCampaign): string | null {
  if (!c.stats) return null;
  const s = c.stats;
  return `${formatUnits(s.displays)} displays, ${formatUnits(s.completions)} completions, ${formatUnits(
    s.rewardsGranted
  )} rewards granted, ${formatMoneyCents(s.spendCents, c.currency)} spent`;
}

function ActivityButton({ c, onViewActivity, activityCampaignId }: { c: AdminSponsorshipCampaign } & AdminSponsorshipActions) {
  if (!onViewActivity) return null;
  return (
    <button className="btn-secondary" disabled={activityCampaignId === c.id} onClick={() => onViewActivity(c.id)}>
      Activity
    </button>
  );
}

function QueueCard({ c, onApprove, onReject, busyId, ...rest }: { c: AdminSponsorshipCampaign } & AdminSponsorshipActions) {
  return (
    <div className="card p-4" data-campaign-id={c.id}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-sm text-muted">
            Advertiser <Advertiser c={c} /> &middot; category:{" "}
            {c.sponsorCategory ?? "not specified"} &middot; {objectiveLabel(c.objective)} &middot; submitted{" "}
            {formatDate(c.submittedAt)}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <ActivityButton c={c} {...rest} />
          <button className="btn-secondary" disabled={busyId === c.id} onClick={() => onReject?.(c.id)}>
            Reject
          </button>
          <button className="btn-primary text-sm" disabled={busyId === c.id} onClick={() => onApprove?.(c.id)}>
            Approve
          </button>
        </div>
      </div>
      <p className="text-sm mb-1">
        Reward: {formatUnits(c.rewardAmountUnits)} {rewardTypeLabel(c.rewardType)} per completion &middot; Sponsor
        charge: {formatMoneyCents(c.sponsorChargeCents, c.currency)} per rewarded completion
      </p>
      <p className="text-xs text-muted mb-1">
        Budget: total {money(c.totalBudgetCents, c.currency)}, daily {money(c.dailyBudgetCents, c.currency)} &middot;
        Per developer: {cap(c.developerDailyCap)}/day, {cap(c.developerLifetimeCap)} ever, displays{" "}
        {c.frequencyCapPerDay === null ? "platform default" : `${formatUnits(c.frequencyCapPerDay)}/day`}
      </p>
      {statsLine(c) && <p className="text-xs text-muted mb-1">So far: {statsLine(c)}</p>}
      <p className="text-xs text-muted mb-3">
        Tools: {formatClientTypes(c.eligibleClientTypes)} &middot; Runs {formatDate(c.startDate)} to{" "}
        {c.endDate ? formatDate(c.endDate) : "no end date"} (UTC)
      </p>
      <ul className="space-y-2">
        {c.offers.map((o) => (
          <li key={o.id} className="border-t border-white/5 pt-2 text-sm" data-offer-id={o.id}>
            <p className="font-medium">
              {o.title} {o.status === "INACTIVE" && <span className="badge ml-1">inactive</span>}
            </p>
            <p className="text-muted">{o.description}</p>
            <p className="text-xs text-muted break-all">Link: {o.ctaUrl}</p>
            <p className="text-xs text-muted">
              Required action: {o.requiredAction ?? "none (opening the link)"} &middot; Ends:{" "}
              {o.expiresAt ? formatDate(o.expiresAt) : "no end date"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Presentational: the admin Sponsorship campaign review queue, kept separate from the Ad Campaign queue. */
export function AdminSponsorshipsView({
  state,
  onRetry,
  actionError,
  activityPanel,
  ...actions
}: {
  state: AdminSponsorshipsState;
  onRetry?: () => void;
  actionError?: string | null;
  /** The open campaign's activity (events and reward ledger), rendered in the activity section. */
  activityPanel?: ReactNode;
} & AdminSponsorshipActions) {
  if (state.status === "loading") return <p className="text-sm text-muted">Loading sponsorship campaigns...</p>;
  if (state.status === "unauthenticated") {
    return (
      <p className="text-sm">
        Your admin session has expired.{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>{" "}
        again to review sponsorships.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="text-sm" role="alert">
        <p className="mb-3">{state.message}</p>
        {onRetry && (
          <button className="btn-primary text-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const { queue, others } = splitReviewQueue(state.campaigns);
  return (
    <>
      {actionError && (
        <p className="text-sm text-red-400 mb-4" role="alert">
          {actionError}
        </p>
      )}
      <section className="mb-10">
        <h2 className="font-medium mb-4">
          Sponsorships pending review {queue.length > 0 && <span className="badge ml-1">{queue.length}</span>}
        </h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">No sponsorship campaigns waiting on review.</p>
        ) : (
          <div className="space-y-3">
            {queue.map((c) => (
              <QueueCard key={c.id} c={c} {...actions} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="font-medium mb-4">All sponsorship campaigns</h2>
        {others.length === 0 ? (
          <p className="text-sm text-muted">No other sponsorship campaigns.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-muted text-left border-b border-white/5">
                <tr>
                  <th className="font-normal p-3">Sponsorship</th>
                  <th className="font-normal p-3">Advertiser</th>
                  <th className="font-normal p-3">Status</th>
                  <th className="font-normal p-3">Reward / charge</th>
                  <th className="font-normal p-3">Displays / completions / spend</th>
                  <th className="font-normal p-3"></th>
                </tr>
              </thead>
              <tbody>
                {others.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 last:border-0" data-campaign-id={c.id}>
                    <td className="p-3">
                      {c.name}
                      {c.status === "REJECTED" && c.rejectionReason && (
                        <span className="block text-xs text-muted">Rejected: {c.rejectionReason}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Advertiser c={c} />
                    </td>
                    <td className="p-3">{c.status}</td>
                    <td className="p-3">
                      {formatUnits(c.rewardAmountUnits)} {rewardTypeLabel(c.rewardType)} /{" "}
                      {formatMoneyCents(c.sponsorChargeCents, c.currency)}
                    </td>
                    <td className="p-3">
                      {c.stats
                        ? `${formatUnits(c.stats.displays)} / ${formatUnits(c.stats.completions)} / ${formatMoneyCents(
                            c.stats.spendCents,
                            c.currency
                          )}`
                        : "not available"}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap space-x-2">
                      <ActivityButton c={c} {...actions} />
                      {c.status === "APPROVED" && (
                        <button
                          className="btn-secondary"
                          disabled={actions.busyId === c.id}
                          onClick={() => actions.onPause?.(c.id)}
                        >
                          Pause
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-medium mb-2">Sponsorship activity and reward events</h2>
        {activityPanel ?? (
          <p className="text-sm text-muted">
            Choose Activity on a sponsorship campaign to inspect its sponsorship events (displays, skips, opens,
            completions per developer) and developer reward ledger, newest first, for fraud or abuse review.
          </p>
        )}
      </section>
    </>
  );
}
