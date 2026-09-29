import Link from "next/link";
import {
  activeOfferCount,
  canSubmit,
  formatMoneyCents,
  formatUnits,
  rewardTypeLabel,
  statusLabel,
  type CampaignListResult,
  type SponsorshipCampaign,
  type SponsorshipStatus,
} from "../lib/sponsorships";

export type CampaignListState = { status: "loading" } | CampaignListResult;

const STATUS_COLOR: Record<SponsorshipStatus, string> = {
  DRAFT: "text-muted",
  SUBMITTED: "text-yellow-400",
  APPROVED: "text-green-400",
  REJECTED: "text-red-400",
  PAUSED: "text-orange-400",
  ARCHIVED: "text-muted",
};

export function StatusText({ status }: { status: SponsorshipStatus }) {
  return (
    <span className={STATUS_COLOR[status]} data-status={status}>
      {statusLabel(status)}
    </span>
  );
}

export function SessionExpired({ what }: { what: string }) {
  return (
    <p className="text-sm">
      Your session has expired.{" "}
      <Link href="/login" className="text-accent">
        Sign in
      </Link>{" "}
      again to see {what}.
    </p>
  );
}

export function ErrorWithRetry({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-sm" role="alert">
      <p className="mb-3">{message}</p>
      {onRetry && (
        <button className="btn-primary text-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function Row({
  c,
  busyId,
  onSubmitCampaign,
}: {
  c: SponsorshipCampaign;
  busyId?: string | null;
  onSubmitCampaign?: (id: string) => void;
}) {
  const stats = c.stats;
  return (
    <tr className="border-b border-white/5 last:border-0" data-campaign-id={c.id}>
      <td className="p-4">
        <Link href={`/sponsorships/${encodeURIComponent(c.id)}`} className="hover:text-accent">
          {c.name}
        </Link>
        <span className="block text-xs text-muted">
          {activeOfferCount(c)} active offer{activeOfferCount(c) === 1 ? "" : "s"}
        </span>
      </td>
      <td className="p-4">
        <StatusText status={c.status} />
      </td>
      <td className="p-4">
        {formatUnits(c.rewardAmountUnits)} {rewardTypeLabel(c.rewardType)}
        <span className="block text-xs text-muted">{formatMoneyCents(c.sponsorChargeCents, c.currency)} per completion</span>
      </td>
      <td className="p-4">{stats ? formatUnits(stats.displays) : "-"}</td>
      <td className="p-4">{stats ? formatUnits(stats.completions) : "-"}</td>
      <td className="p-4">{stats ? formatMoneyCents(stats.spendCents, c.currency) : "-"}</td>
      <td className="p-4 text-right">
        {c.status === "DRAFT" &&
          (canSubmit(c) ? (
            <button
              className="btn-primary text-sm"
              disabled={busyId === c.id}
              onClick={() => onSubmitCampaign?.(c.id)}
            >
              Submit for review
            </button>
          ) : (
            <Link href={`/sponsorships/${encodeURIComponent(c.id)}`} className="text-xs text-accent">
              Add an offer to submit
            </Link>
          ))}
      </td>
    </tr>
  );
}

/** Presentational: the sponsor's Sponsorship campaign list. */
export function SponsorshipCampaignsView({
  state,
  onRetry,
  onSubmitCampaign,
  busyId,
  actionError,
}: {
  state: CampaignListState;
  onRetry?: () => void;
  onSubmitCampaign?: (id: string) => void;
  busyId?: string | null;
  actionError?: string | null;
}) {
  return (
    <>
      <p className="text-sm text-muted mb-8 max-w-2xl">
        Sponsorships fund Developer Rewards: developers who complete your sponsored offer earn a reward
        such as AI or API credits, and you pay per rewarded completion. They are separate from Ad
        Campaigns, which are priced per thousand impressions.
      </p>
      {actionError && (
        <p className="text-sm text-red-400 mb-4" role="alert">
          {actionError}
        </p>
      )}
      <SponsorshipCampaignsBody
        state={state}
        onRetry={onRetry}
        onSubmitCampaign={onSubmitCampaign}
        busyId={busyId}
      />
    </>
  );
}

function SponsorshipCampaignsBody({
  state,
  onRetry,
  onSubmitCampaign,
  busyId,
}: {
  state: CampaignListState;
  onRetry?: () => void;
  onSubmitCampaign?: (id: string) => void;
  busyId?: string | null;
}) {
  if (state.status === "loading") return <p className="text-sm text-muted">Loading your sponsorship campaigns...</p>;
  if (state.status === "unauthenticated") return <SessionExpired what="your sponsorship campaigns" />;
  if (state.status === "error") return <ErrorWithRetry message={state.message} onRetry={onRetry} />;
  if (state.campaigns.length === 0) {
    return (
      <div className="card p-8 text-center text-sm">
        <p className="mb-2">No sponsorship campaigns yet.</p>
        <Link href="/sponsorships/new" className="text-accent">
          Create your first sponsorship
        </Link>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-muted text-left border-b border-white/5">
          <tr>
            <th className="font-normal p-4">Sponsorship</th>
            <th className="font-normal p-4">Status</th>
            <th className="font-normal p-4">Developer Reward</th>
            <th className="font-normal p-4">Displays</th>
            <th className="font-normal p-4">Completions</th>
            <th className="font-normal p-4">Spend</th>
            <th className="font-normal p-4"></th>
          </tr>
        </thead>
        <tbody>
          {state.campaigns.map((c) => (
            <Row key={c.id} c={c} busyId={busyId} onSubmitCampaign={onSubmitCampaign} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
