"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "./primitives";

type Stage = "offer" | "verifying" | "rewarded";

/**
 * A fictional sponsored opportunity, as a developer would see it. Pressing
 * the button plays through what DevAds does next. Nothing is requested from
 * any server.
 */
export function HeroOpportunityCard() {
  const [stage, setStage] = useState<Stage>("offer");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function run() {
    setStage("verifying");
    timer.current = window.setTimeout(() => setStage("rewarded"), 1100);
  }

  return (
    <div className="w-full max-w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#0e0f12]/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fund">Sponsored opportunity</span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fund/60" />
      </div>

      <div className="px-4 pb-4 pt-3.5" aria-live="polite">
        <p className="text-[12px] text-[color:var(--mk-muted)]">Cloud infrastructure</p>
        <p className="mt-0.5 text-[15px] font-medium tracking-[-0.01em]">Explore the platform</p>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-value/20 bg-value/[0.06] px-3 py-2">
          <span className="text-[12px] text-[color:var(--mk-muted)]">Developer credits</span>
          <span className="font-mono text-[13px] text-value">+ $20</span>
        </div>

        {stage === "offer" && (
          <button
            type="button"
            onClick={run}
            className="mt-3 flex h-9 w-full items-center justify-center rounded-lg bg-white/[0.07] text-[13px] font-medium transition-colors hover:bg-white/[0.12]"
          >
            View opportunity
          </button>
        )}
        {stage === "verifying" && (
          <div className="mt-3 flex h-9 items-center justify-center gap-2 rounded-lg border border-signal/25 text-[12.5px] text-signal">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
            Verifying engagement
          </div>
        )}
        {stage === "rewarded" && (
          <div className="mt-3 flex h-9 items-center justify-between rounded-lg border border-value/25 px-3 text-[12.5px]">
            <span className="flex items-center gap-1.5 text-value">
              <Check /> Added to wallet
            </span>
            <button
              type="button"
              onClick={() => setStage("offer")}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--mk-dim)] hover:text-white"
            >
              Replay
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] text-[color:var(--mk-dim)]">Fictional example, not a real sponsor</p>
      </div>
    </div>
  );
}
