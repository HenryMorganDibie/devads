import Link from "next/link";
import {
  eventTypeLabel,
  formatDateTime,
  formatUnits,
  rewardTypeLabel,
  type ActivityPageResult,
  type AdminRewardLedgerEntry,
  type AdminSponsorshipCampaign,
  type AdminSponsorshipEvent,
} from "../lib/sponsorships";

export type ActivityPanelState<T> = { status: "loading" } | ActivityPageResult<T>;

export interface ActivityPaging {
  /** 1-based page currently shown. */
  pageNumber: number;
  onNewer?: () => void;
  onOlder?: () => void;
  onRetry?: () => void;
}

function Pager({ paging, hasOlder }: { paging: ActivityPaging; hasOlder: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 p-3 text-xs text-muted">
      <span>Page {paging.pageNumber}</span>
      <button className="btn-secondary" disabled={paging.pageNumber <= 1} onClick={() => paging.onNewer?.()}>
        Newer
      </button>
      <button className="btn-secondary" disabled={!hasOlder} onClick={() => paging.onOlder?.()}>
        Older
      </button>
    </div>
  );
}

function PanelStatus<T>({
  state,
  what,
  paging,
}: {
  state: Exclude<ActivityPanelState<T>, { status: "ok" }>;
  what: string;
  paging: ActivityPaging;
}) {
  if (state.status === "loading") return <p className="text-sm text-muted p-3">Loading {what}...</p>;
  if (state.status === "unauthenticated") {
    return (
      <p className="text-sm p-3">
        Your admin session has expired.{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>{" "}
        again to inspect {what}.
      </p>
    );
  }
  return (
    <div className="text-sm p-3" role="alert">
      <p className="mb-3">{state.message}</p>
      {paging.onRetry && (
        <button className="btn-primary text-sm" onClick={paging.onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function Id({ value }: { value: string | null }) {
  return value === null ? <span className="text-muted">none</span> : <span className="font-mono break-all">{value}</span>;
}

function EventsTable({ items }: { items: AdminSponsorshipEvent[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted text-left border-b border-white/5">
        <tr>
          <th className="font-normal p-2">Time (UTC)</th>
          <th className="font-normal p-2">Event</th>
          <th className="font-normal p-2">Developer</th>
          <th className="font-normal p-2">Session</th>
          <th className="font-normal p-2">Event id</th>
          <th className="font-normal p-2">For display</th>
          <th className="font-normal p-2">Offer</th>
        </tr>
      </thead>
      <tbody>
        {items.map((e) => (
          <tr key={e.eventId} className="border-b border-white/5 last:border-0 align-top" data-event-id={e.eventId}>
            <td className="p-2 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
            <td className="p-2">{eventTypeLabel(e.type)}</td>
            <td className="p-2"><Id value={e.developerId} /></td>
            <td className="p-2"><Id value={e.sessionId} /></td>
            <td className="p-2"><Id value={e.eventId} /></td>
            <td className="p-2"><Id value={e.displayEventId} /></td>
            <td className="p-2"><Id value={e.offerId} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RewardsTable({ items }: { items: AdminRewardLedgerEntry[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted text-left border-b border-white/5">
        <tr>
          <th className="font-normal p-2">Time (UTC)</th>
          <th className="font-normal p-2">Developer</th>
          <th className="font-normal p-2">Entry</th>
          <th className="font-normal p-2">Amount</th>
          <th className="font-normal p-2">Status</th>
          <th className="font-normal p-2">For display</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id} className="border-b border-white/5 last:border-0 align-top" data-ledger-id={r.id}>
            <td className="p-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
            <td className="p-2"><Id value={r.developerId} /></td>
            <td className="p-2">{r.entryType}</td>
            <td className="p-2 whitespace-nowrap">
              {formatUnits(r.amountUnits)} {rewardTypeLabel(r.rewardType)}
            </td>
            <td className="p-2">{r.status}</td>
            <td className="p-2"><Id value={r.sponsorshipEventId} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Presentational, read-only: one sponsorship campaign's events and reward
 * ledger, newest first, for fraud and abuse review. Developers appear by id only.
 */
export function SponsorshipActivityView({
  campaign,
  events,
  rewards,
  eventsPaging,
  rewardsPaging,
  onClose,
}: {
  campaign: Pick<AdminSponsorshipCampaign, "id" | "name" | "advertiserId" | "advertiserName">;
  events: ActivityPanelState<AdminSponsorshipEvent>;
  rewards: ActivityPanelState<AdminRewardLedgerEntry>;
  eventsPaging: ActivityPaging;
  rewardsPaging: ActivityPaging;
  onClose?: () => void;
}) {
  return (
    <div data-activity-campaign-id={campaign.id}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-medium">Activity: {campaign.name}</p>
          <p className="text-xs text-muted">
            {campaign.advertiserName ?? "Advertiser"} <span className="font-mono">{campaign.advertiserId}</span>{" "}
            &middot; Read-only. A completion&apos;s &quot;for display&quot; id is the server-recorded display it
            claims; a reward&apos;s is the display it paid for.
          </p>
        </div>
        {onClose && (
          <button className="btn-secondary shrink-0" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <h3 className="text-sm font-medium mb-2">Sponsorship events</h3>
      <div className="card overflow-x-auto mb-6">
        {events.status !== "ok" ? (
          <PanelStatus state={events} what="sponsorship events" paging={eventsPaging} />
        ) : events.page.items.length === 0 ? (
          <>
            <p className="text-sm text-muted p-3">No sponsorship events recorded for this campaign.</p>
            {eventsPaging.pageNumber > 1 && <Pager paging={eventsPaging} hasOlder={false} />}
          </>
        ) : (
          <>
            <EventsTable items={events.page.items} />
            <Pager paging={eventsPaging} hasOlder={events.page.nextCursor !== null} />
          </>
        )}
      </div>

      <h3 className="text-sm font-medium mb-2">Developer reward ledger</h3>
      <div className="card overflow-x-auto">
        {rewards.status !== "ok" ? (
          <PanelStatus state={rewards} what="reward ledger entries" paging={rewardsPaging} />
        ) : rewards.page.items.length === 0 ? (
          <>
            <p className="text-sm text-muted p-3">No developer rewards recorded for this campaign.</p>
            {rewardsPaging.pageNumber > 1 && <Pager paging={rewardsPaging} hasOlder={false} />}
          </>
        ) : (
          <>
            <RewardsTable items={rewards.page.items} />
            <Pager paging={rewardsPaging} hasOlder={rewards.page.nextCursor !== null} />
          </>
        )}
      </div>
    </div>
  );
}
