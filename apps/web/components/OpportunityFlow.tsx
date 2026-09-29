"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadSession } from "../lib/api";
import { protocolClient } from "../lib/beta";
import { completionErrorMessage } from "../lib/betaOffer";
import { formatUnits, rewardTypeLabel } from "../lib/rewards";

const DEFAULT_SECONDS = 15;

type Phase =
  | { status: "opening" }
  | { status: "engaging" }
  | { status: "submitting" }
  | { status: "done"; rewarded: boolean; amount?: number; rewardType?: string }
  | { status: "error"; message: string };

function storageKey(kind: "open" | "complete", displayEventId: string) {
  return `devads:beta-${kind}:${displayEventId}`;
}

/** One eventId per display and kind, so reloads and retries are idempotent on the server. */
function stableEventId(kind: "open" | "complete", displayEventId: string): string {
  const key = storageKey(kind, displayEventId);
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * The DevAds-controlled qualifying action shared by every beta opportunity
 * page: record OFFER_OPENED for this display (idempotent across reloads),
 * let the developer spend the required time on the page, then submit the
 * completion. The server alone decides whether the time has passed and
 * whether a reward is granted.
 */
export function OpportunityFlow({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const displayEventId = params.get("d");
  const sessionId = params.get("s") ?? undefined;
  const required = Math.min(Math.max(Number(params.get("m")) || DEFAULT_SECONDS, 0), 3600);
  const [phase, setPhase] = useState<Phase>({ status: "opening" });
  const [remaining, setRemaining] = useState(required);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Without a display there is nothing to record: the page is just content.
    if (!displayEventId) return;
    if (!loadSession()) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    protocolClient()
      .reportOfferEvent({ type: "OFFER_OPENED", displayEventId, sessionId, eventId: stableEventId("open", displayEventId) })
      .then(() => setPhase({ status: "engaging" }))
      .catch((err) => setPhase({ status: "error", message: completionErrorMessage(err) }));
  }, [displayEventId, sessionId, router]);

  useEffect(() => {
    if (phase.status !== "engaging" || remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [phase.status, remaining]);

  async function complete() {
    if (!displayEventId) return;
    setPhase({ status: "submitting" });
    try {
      const res = await protocolClient().completeQualifyingAction({
        displayEventId,
        sessionId,
        eventId: stableEventId("complete", displayEventId),
      });
      setPhase({ status: "done", rewarded: Boolean(res.rewarded), amount: res.reward?.amountUnits, rewardType: res.reward?.rewardType });
    } catch (err) {
      setPhase({ status: "error", message: completionErrorMessage(err) });
      // A fresh eventId lets the developer retry once the reason is resolved (e.g. waited long enough).
      try {
        window.sessionStorage.removeItem(storageKey("complete", displayEventId));
      } catch {}
    }
  }

  if (!displayEventId) {
    return (
      <>
        {children}
        <div className="card p-6">
          <p className="mb-4">
            Beta Credits for this page are earned by opening it from a DevAds Beta Opportunity (on your dashboard or in
            the VS Code extension).
          </p>
          <Link href="/app" className="btn-primary inline-block">
            Go to dashboard
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {children}

      <div className="card p-5" aria-live="polite">
        {phase.status === "opening" && <p className="text-sm text-muted">Recording that you opened this opportunity...</p>}
        {(phase.status === "engaging" || phase.status === "submitting") && (
          <>
            <p className="text-sm mb-4">
              {remaining > 0
                ? `Take a moment with this page. You can confirm in ${remaining}s.`
                : "Ready? Confirm completion and DevAds will verify it on the server."}
            </p>
            <button className="btn-primary" onClick={complete} disabled={remaining > 0 || phase.status === "submitting"}>
              {phase.status === "submitting" ? "Verifying..." : "Confirm completion"}
            </button>
          </>
        )}
        {phase.status === "done" && (
          <>
            <p className="font-medium mb-1">
              {phase.rewarded && phase.amount !== undefined
                ? `Verified. ${formatUnits(phase.amount)} ${rewardTypeLabel(phase.rewardType ?? "")} added to your wallet.`
                : "Recorded. No additional reward was granted for this completion (it may already have been rewarded, or a cap applies)."}
            </p>
            <p className="text-sm text-muted mb-4">Beta Credits are not cash and cannot be redeemed.</p>
            <Link href="/app/wallet" className="btn-primary inline-block">
              View wallet
            </Link>
          </>
        )}
        {phase.status === "error" && (
          <>
            <p className="text-sm mb-4" role="alert">
              {phase.message}
            </p>
            <div className="flex gap-4 items-center">
              {displayEventId && (
                <button className="btn-primary" onClick={complete}>
                  Try again
                </button>
              )}
              <Link href="/app" className="text-sm text-accent">
                Back to dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}

