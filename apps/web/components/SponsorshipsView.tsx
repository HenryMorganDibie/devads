import Link from "next/link";
import type { SponsorshipStatusResult } from "../lib/sponsorships";

export type SponsorshipsPageState = { status: "loading" } | SponsorshipStatusResult;

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

/** Presentational: the developer-facing Sponsorships page body. */
export function SponsorshipsView({ state, onRetry }: { state: SponsorshipsPageState; onRetry?: () => void }) {
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
        <p className="text-sm mb-2">There&apos;s no list of sponsorships to browse here yet.</p>
        <p className="text-sm text-muted">
          DevAds picks at most one sponsored offer for you at the moment you&apos;re already waiting
          in a connected tool, based on the tool, your settings and each sponsor&apos;s limits. Offers
          aren&apos;t published as a catalog, so this page can&apos;t show which ones are running right
          now.
        </p>
      </section>

      <section className="card p-6 mb-6">
        <h2 className="font-medium mb-3">Where offers appear</h2>
        <ul className="text-sm space-y-2 list-disc pl-5">
          <li>
            <span className="font-medium">VS Code extension.</span>{" "}
            <span className="text-muted">
              During a long-running terminal command, a status bar item labelled &quot;Sponsored&quot;
              shows the offer and its reward. Sign in with <span className="font-mono">DevAds: Sign In</span>{" "}
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
