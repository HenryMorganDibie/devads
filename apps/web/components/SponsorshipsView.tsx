import Link from "next/link";
import { formatLedgerDate, formatUnits, rewardTypeLabel } from "../lib/rewards";
import {
  formatEligibleClients,
  isReceivableToday,
  type ActiveSponsorship,
  type ActiveSponsorshipsResult,
  type SponsorshipStatusResult,
} from "../lib/sponsorships";

export type SponsorshipsPageState = { status: "loading" } | SponsorshipStatusResult;
export type ActiveSponsorshipsState = { status: "loading" } | ActiveSponsorshipsResult;

/** Visible label used wherever sponsored material is referenced, so it never reads as organic content. */
export function SponsoredBadge() {
  return (
    <span className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border border-yellow-400/40 text-yellow-300">
      Sponsored
    </span>
  );
}

function StatusCard({ state, onRetry }: { state: SponsorshipsPageState; onRetry?: () => void }) {
  if (state.status === "loading") {
    return <p className="text-sm text-muted">Loading your sponsorship settings...</p>;
  }
  if (state.status === "unauthenticated") {
    return (
      <p className="text-sm">
        Your session has expired.{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>{" "}
        again to see your sponsorship settings.
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
  return state.sponsoredContentEnabled ? (
    <p className="text-sm">
      <span className="text-accent font-medium">On.</span> You can receive sponsored offers in your
      connected tools.
    </p>
  ) : (
    <p className="text-sm">
      <span className="font-medium">Off.</span> You won&apos;t receive sponsored offers until you turn
      DevAds back on from your{" "}
      <Link href="/dashboard" className="text-accent">
        dashboard preferences
      </Link>
      .
    </p>
  );
}

function OfferCard({ offer }: { offer: ActiveSponsorship }) {
  const receivable = isReceivableToday(offer);
  return (
    <li className="border-t border-white/5 pt-4" data-offer-id={offer.offerId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-medium">{offer.title}</h3>
        <p className="text-sm">
          <span className="text-muted">Reward:</span>{" "}
          <span className="font-semibold">
            {formatUnits(offer.rewardAmountUnits)} {rewardTypeLabel(offer.rewardType)}
          </span>
        </p>
      </div>
      <p className="text-sm text-muted mb-2">{offer.description}</p>
      {offer.requiredAction && (
        <p className="text-sm mb-1">
          <span className="text-muted">To earn it:</span> {offer.requiredAction}
        </p>
      )}
      <p className="text-xs text-muted">
        Available in: {formatEligibleClients(offer.eligibleClientTypes)}
        {offer.expiresAt && <> &middot; Ends {formatLedgerDate(offer.expiresAt)} (UTC)</>}
      </p>
      {!receivable && (
        <p className="text-xs text-yellow-400/80 mt-1">
          Not available in a tool DevAds supports yet, so you can&apos;t receive this one today.
        </p>
      )}
    </li>
  );
}

function ActiveSponsorshipsList({ offers, onRetry }: { offers: ActiveSponsorshipsState; onRetry?: () => void }) {
  if (offers.status === "loading") {
    return <p className="text-sm text-muted">Loading active sponsorships...</p>;
  }
  if (offers.status === "unauthenticated") {
    return (
      <p className="text-sm">
        Your session has expired.{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>{" "}
        again to see active sponsorships.
      </p>
    );
  }
  if (offers.status === "error") {
    return (
      <div className="text-sm" role="alert">
        <p className="mb-3">{offers.message}</p>
        {onRetry && (
          <button className="btn-primary text-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (!offers.sponsoredContentEnabled) {
    return (
      <p className="text-sm">
        Sponsored content is off, so no sponsorships are listed for you. Turn DevAds back on from
        your{" "}
        <Link href="/dashboard" className="text-accent">
          dashboard preferences
        </Link>{" "}
        to see them.
      </p>
    );
  }
  if (offers.offers.length === 0) {
    return (
      <>
        <p className="text-sm mb-2">No sponsorships are active for you right now.</p>
        <p className="text-sm text-muted">
          When a sponsor runs an offer you&apos;re eligible for, it&apos;s listed here. Check back
          later.
        </p>
      </>
    );
  }
  return (
    <>
      <ul className="space-y-4">
        {offers.offers.map((offer) => (
          <OfferCard key={offer.offerId} offer={offer} />
        ))}
      </ul>
      <p className="text-xs text-muted mt-4">
        This is a list of what&apos;s running, not an offer to complete here. To earn a reward,
        complete the offer when DevAds shows it to you in a connected tool. DevAds shows at most one
        at a time, while you&apos;re already waiting, within each sponsor&apos;s limits, so you may not
        see every listed offer today.
      </p>
    </>
  );
}

/** Presentational: the developer-facing Sponsorships page body. */
export function SponsorshipsView({
  state,
  offers,
  onRetry,
}: {
  state: SponsorshipsPageState;
  offers: ActiveSponsorshipsState;
  onRetry?: () => void;
}) {
  return (
    <>
      <p className="text-sm text-muted mb-8 max-w-2xl">
        Sponsorships are paid placements. An organization funds an offer and, if you choose to
        complete it, you earn a reward such as AI or API credits. They are not DevAds
        recommendations, not organic developer content, and separate from the standard ads that pay
        your ad earnings.
      </p>

      <section className="card p-6 mb-6">
        <h2 className="font-medium mb-3">Your sponsorship setting</h2>
        <StatusCard state={state} onRetry={onRetry} />
        <p className="text-xs text-muted mt-3">
          The same DevAds switch on your dashboard controls both standard ads and sponsorships.
        </p>
      </section>

      <section className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-medium">Active sponsorships</h2>
          <SponsoredBadge />
        </div>
        <ActiveSponsorshipsList offers={offers} onRetry={onRetry} />
      </section>

      <section className="card p-6 mb-6">
        <h2 className="font-medium mb-3">Where offers appear</h2>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>
            <span className="font-medium">VS Code extension.</span>{" "}
            <span className="text-muted">
              During a long-running terminal command, the offer and its reward open in the DevAds panel
              beside your editor, as a card or a short muted video, labelled &quot;Sponsored&quot; (or
              &quot;DevAds Beta &middot; First-party&quot; for DevAds&apos; own campaigns). The status bar is the
              compact alternative. Sign in with <span className="font-mono">DevAds: Sign In</span>{" "}
              and keep <span className="font-mono">devads.sponsorship.enabled</span> on. Opening an offer
              is always your choice, and skipping it costs nothing.
            </span>
          </li>
        </ul>
        <p className="text-xs text-muted mt-3">Other tools aren&apos;t supported yet.</p>
      </section>

      <section className="card p-6">
        <h2 className="font-medium mb-2">Your rewards</h2>
        <p className="text-sm text-muted mb-3">
          Rewards you earn from sponsorships are tracked in your reward wallet, separate from your ad
          earnings.
        </p>
        <Link href="/rewards" className="text-accent text-sm">
          View Developer Rewards
        </Link>
      </section>
    </>
  );
}
