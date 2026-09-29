"use client";

import { useState } from "react";
import { CountUp } from "./CountUp";
import { PreviewTag } from "./primitives";

const OBJECTIVES = [
  { name: "Product discovery", metric: "Product explorations" },
  { name: "Documentation", metric: "Docs sessions" },
  { name: "SDK adoption", metric: "SDK activations" },
  { name: "API adoption", metric: "API keys created" },
  { name: "Project creation", metric: "Projects created" },
  { name: "Integration", metric: "Integrations enabled" },
  { name: "Trial activation", metric: "Trials activated" },
  { name: "Developer education", metric: "Lessons completed" },
  { name: "Event registration", metric: "Registrations" },
];

// A fixed, obviously synthetic series for the conceptual chart.
const SERIES = [8, 11, 10, 14, 13, 17, 16, 21, 19, 24, 26, 25, 30, 33];

function Sparkline() {
  const w = 280;
  const h = 64;
  const max = Math.max(...SERIES);
  const pts = SERIES.map((v, i) => [(i / (SERIES.length - 1)) * w, h - (v / max) * (h - 6) - 3]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7ea6ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#7ea6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#7ea6ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function SponsorWorkbench() {
  const [objective, setObjective] = useState(2);
  const current = OBJECTIVES[objective];

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Dashboard */}
      <div className="mk-panel overflow-hidden lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--mk-muted)]">
            Campaigns <span className="text-[color:var(--mk-dim)]">/</span>
            <span className="text-[color:var(--mk-text)]">Overview</span>
          </span>
          <PreviewTag />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-2 pt-6 sm:px-6">
          <div>
            <p className="mk-eyebrow">Campaign</p>
            <p className="mt-1.5 font-display text-[22px] font-medium tracking-[-0.02em] sm:text-[26px]">Cloud Developer Sponsorship</p>
            <p className="mt-1 text-[13px] text-[color:var(--mk-muted)]">
              Objective &middot; <span className="text-[color:var(--mk-text)]" aria-live="polite">{current.name}</span>
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-value/25 bg-value/[0.07] px-3 py-1 text-[12.5px] text-value">
            <span className="h-1.5 w-1.5 rounded-full bg-value" />
            Active
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4 [&>div]:bg-[#0c0d0f]">
          <div className="px-5 py-5 sm:px-6">
            <dt className="text-[12px] text-[color:var(--mk-muted)]">Budget</dt>
            <dd className="mt-2 font-display text-[22px] tracking-[-0.02em] text-fund">
              <CountUp value={25000} prefix="$" />
            </dd>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <dt className="text-[12px] text-[color:var(--mk-muted)]">Developer rewards</dt>
            <dd className="mt-2 font-display text-[22px] tracking-[-0.02em] text-value">
              <CountUp value={20000} prefix="$" />
            </dd>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <dt className="text-[12px] text-[color:var(--mk-muted)]">Qualified engagements</dt>
            <dd className="mt-2 font-display text-[22px] tracking-[-0.02em] text-signal">
              <CountUp value={2184} />
            </dd>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <dt className="text-[12px] text-[color:var(--mk-muted)]">{current.metric}</dt>
            <dd className="mt-2 font-display text-[22px] tracking-[-0.02em]">
              <CountUp value={641} />
            </dd>
          </div>
        </dl>

        <div className="grid gap-6 px-5 py-6 sm:grid-cols-[1fr_1.2fr] sm:px-6">
          <div>
            <p className="text-[12px] text-[color:var(--mk-muted)]">Budget allocation</p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="h-full w-[80%] bg-value/80" />
              <span className="h-full w-[20%] bg-fund/50" />
            </div>
            <div className="mt-3 flex justify-between text-[11.5px] text-[color:var(--mk-muted)]">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-value" />To developers</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-fund" />Remaining</span>
            </div>
          </div>
          <div>
            <p className="text-[12px] text-[color:var(--mk-muted)]">Verified engagement, last 14 days</p>
            <div className="mt-2">
              <Sparkline />
            </div>
          </div>
        </div>
        <p className="border-t border-white/[0.06] px-5 py-3 text-[11.5px] text-[color:var(--mk-dim)] sm:px-6">
          Sample figures for illustration only. Not a real campaign or customer.
        </p>
      </div>

      {/* Objectives */}
      <div className="flex flex-col rounded-[14px] border border-white/[0.07] p-5 sm:p-6 lg:col-span-4">
        <p className="mk-eyebrow">Sponsor objectives</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--mk-text)]">
          Sponsors choose what outcome they want to support.
        </p>
        <p className="mt-1 text-[13px] text-[color:var(--mk-muted)]">Select one to see the campaign change.</p>
        <div role="radiogroup" aria-label="Campaign objective" className="mt-6 flex flex-wrap gap-2">
          {OBJECTIVES.map((o, i) => {
            const on = i === objective;
            return (
              <button
                key={o.name}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setObjective(i)}
                className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                  on
                    ? "border-signal/50 bg-signal/[0.1] text-[color:var(--mk-text)]"
                    : "border-white/[0.09] text-[color:var(--mk-muted)] hover:border-white/20 hover:text-[color:var(--mk-text)]"
                }`}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
