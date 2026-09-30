"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import { useDeveloper } from "../../components/AppShell";
import {
  fetchHistory,
  fetchSessions,
  protocolClient,
  setSponsorshipsEnabled,
  type DevelopmentSessionListResponse,
  type SponsorshipHistoryResponse,
} from "../../lib/beta";
import { isBetaOffer, opportunityHref, requestWebOpportunity } from "../../lib/betaOffer";
import { fetchRewardWallet, formatLedgerDate, formatSignedUnits, formatUnits, rewardTypeLabel, type WalletLoadResult } from "../../lib/rewards";

const EVENT_LABELS: Record<string, string> = {
  OFFER_DISPLAYED: "Shown",
  OFFER_OPENED: "Opened",
  OFFER_INTERACTED: "Interacted",
  OFFER_SKIPPED: "Skipped",
  OFFER_COMPLETED: "Completed",
};

type OfferState =
  | { status: "idle" | "loading" | "none" | "error" }
  | { status: "ok"; offer: SponsoredOpportunity; sessionId: string };

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 min-w-0 ${className}`}>
      <h2 className="text-xs font-mono uppercase tracking-[0.12em] text-muted mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { me, refresh } = useDeveloper();
  const [wallet, setWallet] = useState<WalletLoadResult | null>(null);
  const [history, setHistory] = useState<SponsorshipHistoryResponse | null>(null);
  const [sessions, setSessions] = useState<DevelopmentSessionListResponse | null>(null);
  const [offer, setOffer] = useState<OfferState>({ status: "idle" });
  const [toggling, setToggling] = useState(false);

  const loadActivity = useCallback(() => {
    fetchRewardWallet(me.developerId).then(setWallet);
    fetchHistory().then(setHistory).catch(() => setHistory(null));
    fetchSessions().then(setSessions).catch(() => setSessions(null));
  }, [me.developerId]);

  const findOpportunity = useCallback(async () => {
    setOffer({ status: "loading" });
    try {
      const { offer, sessionId } = await requestWebOpportunity(protocolClient());
      setOffer(offer ? { status: "ok", offer, sessionId } : { status: "none" });
    } catch {
      setOffer({ status: "error" });
    }
    loadActivity();
  }, [loadActivity]);

  useEffect(() => loadActivity(), [loadActivity]);

  async function toggleSponsorships() {
    setToggling(true);
    const enabled = !me.sponsorshipsEnabled;
    if (await setSponsorshipsEnabled(me.developerId, enabled).catch(() => false)) {
      await refresh();
      if (!enabled) setOffer({ status: "idle" });
    }
    setToggling(false);
  }

  function open(o: SponsoredOpportunity, sessionId: string) {
    const target = opportunityHref(o, sessionId, window.location.origin);
    if (target.internal) router.push(target.href);
    else window.open(target.href, "_blank", "noopener,noreferrer");
  }

  const balances = wallet?.status === "ok" ? wallet.wallet.balances : [];
  const recent = wallet?.status === "ok" ? wallet.wallet.recentLedger.slice(0, 5) : [];
  const interactions = history?.events.filter((e) => e.type !== "OFFER_DISPLAYED").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted mt-1">
          {me.displayName ?? me.email}. DevAds is in developer beta: every opportunity here is run and funded by DevAds.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Beta status">
          <p className="font-medium">Beta member</p>
          <p className="text-sm text-muted mt-1">
            Joined {me.betaJoinedAt ? formatLedgerDate(me.betaJoinedAt) : "-"} · terms {me.betaTermsVersion}
          </p>
          {me.betaTermsVersion !== me.currentBetaTermsVersion && (
            <Link href="/app/onboarding" className="text-sm text-accent mt-2 inline-block">
              Review updated terms
            </Link>
          )}
        </Card>

        <Card title="Sponsorships">
          <p className="font-medium">{me.sponsorshipsEnabled ? "Opted in" : "Opted out"}</p>
          <p className="text-sm text-muted mt-1 mb-3">
            {me.sponsorshipsEnabled ? "You can receive labelled opportunities." : "No opportunities will be shown to you."}
          </p>
          <button className="text-sm text-accent disabled:opacity-50" onClick={toggleSponsorships} disabled={toggling}>
            {me.sponsorshipsEnabled ? "Opt out" : "Opt in"}
          </button>
        </Card>

        <Card title="Wallet">
          {wallet === null ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : wallet.status !== "ok" ? (
            <p className="text-sm text-muted">Wallet unavailable.</p>
          ) : balances.length === 0 ? (
            <p className="text-sm text-muted">No rewards yet.</p>
          ) : (
            <ul className="space-y-1">
              {balances.map((b) => (
                <li key={b.rewardType} className="flex justify-between">
                  <span className="text-sm">{rewardTypeLabel(b.rewardType)}</span>
                  <span className="font-mono">{formatUnits(b.availableUnits)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/wallet" className="text-sm text-accent mt-3 inline-block">
            Open wallet
          </Link>
        </Card>
      </div>

      <Card title="Beta opportunity">
        {!me.sponsorshipsEnabled ? (
          <p className="text-sm text-muted">Opt in to sponsorships to receive DevAds Beta Opportunities.</p>
        ) : offer.status === "ok" ? (
          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] rounded border border-accent/40 text-accent px-1.5 py-0.5">
              {isBetaOffer(offer.offer) ? "DevAds Beta Opportunity" : "Sponsored"}
            </span>
            <h3 className="font-medium mt-3">{offer.offer.title}</h3>
            <p className="text-sm text-muted mt-1">{offer.offer.description}</p>
            {offer.offer.requiredAction && <p className="text-sm mt-3">To qualify: {offer.offer.requiredAction}</p>}
            <p className="text-sm mt-1">
              Reward: <span className="font-mono">{formatUnits(offer.offer.rewardAmountUnits)}</span>{" "}
              {rewardTypeLabel(offer.offer.rewardType)}
              {isBetaOffer(offer.offer) && <span className="text-muted"> (not cash, not redeemable)</span>}
            </p>
            {isBetaOffer(offer.offer) && (
              <p className="text-xs text-muted mt-2">Funded by DevAds as part of the developer beta. No external sponsor is involved.</p>
            )}
            <button className="btn-primary mt-4" onClick={() => open(offer.offer, offer.sessionId)}>
              Open opportunity
            </button>
          </div>
        ) : offer.status === "loading" ? (
          <p className="text-sm text-muted">Checking for an opportunity...</p>
        ) : (
          <div>
            <p className="text-sm text-muted mb-3">
              {offer.status === "none"
                ? "No opportunity is available for you right now. Caps limit how often each one appears; check back later."
                : offer.status === "error"
                  ? "We couldn't check for opportunities. Please try again."
                  : "Opportunities are selected on the server from active DevAds beta campaigns."}
            </p>
            <button className="btn-primary" onClick={findOpportunity}>
              Find a beta opportunity
            </button>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Recent rewards">
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Rewards appear here once a qualifying interaction is verified.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span>
                    {rewardTypeLabel(e.rewardType)} <span className="text-muted">· {formatLedgerDate(e.createdAt)}</span>
                  </span>
                  <span className="font-mono">{formatSignedUnits(e)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Interactions">
          <p className="text-sm">
            <span className="font-mono">{interactions}</span> recent interactions across{" "}
            <span className="font-mono">{sessions?.sessions.length ?? 0}</span> sessions
          </p>
          <ul className="space-y-2 text-sm mt-3">
            {(history?.events ?? []).slice(0, 5).map((e) => (
              <li key={e.eventId} className="flex justify-between gap-3">
                <span className="truncate">{e.offerTitle}</span>
                <span className="text-muted shrink-0">{EVENT_LABELS[e.type] ?? e.type}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/sessions" className="text-sm text-accent mt-3 inline-block">
            View sessions and history
          </Link>
        </Card>
      </div>

      <Card title="VS Code extension">
        {me.clientInstallations.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {me.clientInstallations.map((i, n) => (
              <li key={n}>
                Connected: {i.platform} {i.extensionVersion && <span className="text-muted">v{i.extensionVersion}</span>}{" "}
                <span className="text-muted">· last seen {formatLedgerDate(i.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm">
            <p className="mb-2">Not connected. To use DevAds inside VS Code with this same account:</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted">
              <li>
                <a href="/downloads/devads-0.1.0.vsix" className="text-accent" download>
                  Download the DevAds extension (.vsix)
                </a>
                , then in VS Code open the Extensions view, click the &ldquo;...&rdquo; menu, and choose &ldquo;Install from
                VSIX...&rdquo;. DevAds is not yet listed on the VS Code Marketplace, so this manual install is required for now.
              </li>
              <li>Run &ldquo;DevAds: Sign In&rdquo; from the command palette.</li>
              <li>
                Enter the code it shows on the{" "}
                <Link href="/device" className="text-accent">
                  device page
                </Link>{" "}
                while signed in here.
              </li>
            </ol>
          </div>
        )}
      </Card>
    </div>
  );
}
