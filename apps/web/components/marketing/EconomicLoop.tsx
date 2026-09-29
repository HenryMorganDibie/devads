"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Eyebrow, FLOW_HEX, Section } from "./primitives";

type Actor = "Sponsor" | "Developer" | "DevAds";

const ACTOR_COLOR: Record<Actor, string> = {
  Sponsor: FLOW_HEX.fund,
  Developer: FLOW_HEX.value,
  DevAds: "#edece8",
};

// Mirrors the implemented flow: campaign -> opt-in -> server-selected offer
// -> engagement -> server-side verification -> sponsor spend -> reward
// ledger -> wallet. The platform fee is the margin between the two.
const STEPS: Array<{ actor: Actor; title: string; body: string }> = [
  {
    actor: "Sponsor",
    title: "Funds a campaign",
    body: "Any legitimate organization sets a budget, the outcome it wants to support and the reward a developer receives.",
  },
  {
    actor: "Developer",
    title: "Opts into sponsorship",
    body: "Nothing is shown to developers who have not opted in, and opting out takes one switch.",
  },
  {
    actor: "DevAds",
    title: "Presents an eligible opportunity",
    body: "The server picks an offer the developer is eligible for, within budgets, caps and the client's context.",
  },
  {
    actor: "Developer",
    title: "Chooses to engage",
    body: "The developer opens the offer and completes the sponsor's action, or skips it at no cost.",
  },
  {
    actor: "DevAds",
    title: "Verifies the qualifying interaction",
    body: "Server-issued displays, idempotent events and per-developer caps tie each reward to one real interaction.",
  },
  {
    actor: "Sponsor",
    title: "Is charged according to the campaign",
    body: "Each verified completion is charged at the campaign's configured price, never beyond its budget.",
  },
  {
    actor: "Developer",
    title: "Receives the reward",
    body: "The reward type and amount come from the campaign, never from the client.",
  },
  {
    actor: "Developer",
    title: "Sees it in the wallet",
    body: "The wallet is backed by a reward ledger kept separate from any other earnings.",
  },
  {
    actor: "DevAds",
    title: "Earns its platform fee",
    body: "The sponsor's charge covers the developer's reward and a fee for running the infrastructure.",
  },
];

const stepsFor = (actor: Actor) =>
  STEPS.flatMap((s, i) => (s.actor === actor ? [i + 1] : [])).join(", ");

const R = 118;
const C = 160;
const nodeAt = (i: number) => {
  const a = (-90 + (i * 360) / STEPS.length) * (Math.PI / 180);
  return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
};

/**
 * The business model as a nine-step loop. It advances on its own while in
 * view, pauses on hover or focus, and never auto-advances for visitors who
 * prefer reduced motion.
 */
export function EconomicLoop() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    const el = ref.current;
    let io: IntersectionObserver | undefined;
    if (el && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
      io.observe(el);
    }
    return () => {
      mq.removeEventListener("change", onChange);
      io?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (paused || !visible || reduced) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), 3200);
    return () => window.clearTimeout(t);
  }, [active, paused, visible, reduced]);

  const circumference = 2 * Math.PI * R;
  const progress = ((active + 1) / STEPS.length) * circumference;

  return (
    <Section id="how-it-works" labelledBy="loop-title">
      <Container>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Eyebrow index="03">How it works</Eyebrow>
            <h2 id="loop-title" className="mk-h2 mt-6">
              The economic loop. <span className="text-[color:var(--mk-dim)]">Three parties, one exchange.</span>
            </h2>
          </div>
          <p className="mk-lede self-end lg:col-span-4 lg:col-start-9">
            This is the whole business model. Sponsors pay for verified outcomes, developers receive the value, and
            DevAds runs the exchange for a fee.
          </p>
        </div>

        <ul className="mt-10 grid gap-px overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3" aria-label="Who does what">
          {(
            [
              ["Sponsor", "Pays for verified outcomes"],
              ["Developer", "Opts in, engages, gets rewarded"],
              ["DevAds", "Matches, verifies, keeps a fee"],
            ] as const
          ).map(([actor, role]) => (
            <li key={actor} className="flex items-center justify-between gap-4 bg-[#0a0b0d] px-5 py-4">
              <span className="flex items-center gap-3">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACTOR_COLOR[actor] }} />
                <span>
                  <span className="block text-[15px] tracking-[-0.01em]">{actor}</span>
                  <span className="block text-[13px] text-[color:var(--mk-muted)]">{role}</span>
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tracking-[0.1em] text-[color:var(--mk-dim)]">
                STEPS {stepsFor(actor)}
              </span>
            </li>
          ))}
        </ul>

        <div
          ref={ref}
          className="mt-16 grid items-center gap-12 lg:grid-cols-12 lg:gap-8"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="relative mx-auto w-full max-w-[380px] lg:col-span-5">
            <svg viewBox="0 0 320 320" className="w-full" aria-hidden>
              <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              <circle
                cx={C}
                cy={C}
                r={R}
                fill="none"
                stroke={ACTOR_COLOR[STEPS[active].actor]}
                strokeOpacity="0.8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={`${progress} ${circumference}`}
                transform={`rotate(-90 ${C} ${C})`}
                style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.2,0.7,0.2,1), stroke 0.6s ease" }}
              />
              <circle cx={C} cy={C} r={R - 26} fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="1 5" className="mk-spin-slow" />
              {STEPS.map((s, i) => {
                const p = nodeAt(i);
                const on = i === active;
                const done = i <= active;
                return (
                  <g key={i}>
                    {on && <circle cx={p.x} cy={p.y} r="15" fill={ACTOR_COLOR[s.actor]} opacity="0.12" />}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="9"
                      fill="#0c0d10"
                      stroke={done ? ACTOR_COLOR[s.actor] : "rgba(255,255,255,0.15)"}
                      strokeWidth="1.25"
                      style={{ transition: "stroke 0.5s ease" }}
                    />
                    <text
                      x={p.x}
                      y={p.y + 3}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize="8.5"
                      fill={on ? ACTOR_COLOR[s.actor] : "rgba(255,255,255,0.45)"}
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
              <span className="font-mono text-[11px] tracking-[0.14em]" style={{ color: ACTOR_COLOR[STEPS[active].actor] }}>
                STEP 0{active + 1} / 0{STEPS.length}
              </span>
              <span className="mt-2 font-display text-[17px] font-medium leading-snug tracking-[-0.02em] sm:text-[19px]" aria-live="polite">
                {STEPS[active].actor} {STEPS[active].title.charAt(0).toLowerCase() + STEPS[active].title.slice(1)}
              </span>
            </div>
          </div>

          <ol className="lg:col-span-6 lg:col-start-7">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <li key={s.title} className="border-t border-white/[0.06] last:border-b">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={on ? "step" : undefined}
                    className="group grid w-full grid-cols-[2.5rem_1fr] items-baseline gap-x-3 py-3.5 text-left sm:py-4"
                  >
                    <span className="font-mono text-[11px] tracking-[0.1em] transition-colors" style={{ color: on ? ACTOR_COLOR[s.actor] : "var(--mk-dim)" }}>
                      0{i + 1}
                    </span>
                    <span>
                      <span
                        className={`block text-[16.5px] tracking-[-0.015em] transition-colors sm:text-[18px] ${
                          on ? "text-[color:var(--mk-text)]" : "text-[color:var(--mk-muted)] group-hover:text-[color:var(--mk-text)]"
                        }`}
                      >
                        <span className="mr-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: ACTOR_COLOR[s.actor] }}>
                          {s.actor}
                        </span>
                        {s.title}
                      </span>
                      <span
                        className={`grid transition-[grid-template-rows,opacity] duration-500 ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                      >
                        <span className="overflow-hidden">
                          <span className="block pt-2 text-[14.5px] leading-relaxed text-[color:var(--mk-muted)]">{s.body}</span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
