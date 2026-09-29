"use client";

import { useEffect, useRef, useState } from "react";
import { Container, Eyebrow, FLOW_HEX, Section } from "./primitives";

const STEPS = [
  {
    title: "Sponsor funds a campaign",
    body: "A company sets a budget, the outcome it wants to support and the reward a developer receives.",
    color: FLOW_HEX.fund,
  },
  {
    title: "Developer chooses to participate",
    body: "Sponsored opportunities reach only developers who have opted in. Skipping one is always free.",
    color: FLOW_HEX.value,
  },
  {
    title: "Developer receives value",
    body: "Completing the sponsor's chosen action credits the reward to the developer's wallet.",
    color: FLOW_HEX.value,
  },
  {
    title: "DevAds verifies the interaction",
    body: "Server-issued displays, idempotent events and per-developer caps tie each reward to one real interaction.",
    color: FLOW_HEX.signal,
  },
  {
    title: "Sponsor gets measurable engagement",
    body: "Reporting shows displays, completions and rewards granted, not anonymous impressions.",
    color: FLOW_HEX.signal,
  },
  {
    title: "DevAds earns a platform fee",
    body: "The sponsor's charge covers the developer's reward and a fee for running the infrastructure.",
    color: "#edece8",
  },
];

const R = 118;
const C = 160;
const nodeAt = (i: number) => {
  const a = (-90 + i * 60) * (Math.PI / 180);
  return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
};

/**
 * The business model as a six-step loop. It advances on its own while in
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
          <div className="lg:col-span-7">
            <Eyebrow index="03">How it works</Eyebrow>
            <h2 id="loop-title" className="mk-h2 mt-6">
              The economic loop. <span className="text-[color:var(--mk-dim)]">Six steps, one exchange.</span>
            </h2>
          </div>
          <p className="mk-lede self-end lg:col-span-4 lg:col-start-9">
            This is the whole business model. Sponsors pay for outcomes, developers receive the value, and DevAds runs
            the exchange for a fee.
          </p>
        </div>

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
                stroke={STEPS[active].color}
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
                    {on && <circle cx={p.x} cy={p.y} r="15" fill={s.color} opacity="0.12" />}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="9"
                      fill="#0c0d10"
                      stroke={done ? s.color : "rgba(255,255,255,0.15)"}
                      strokeWidth="1.25"
                      style={{ transition: "stroke 0.5s ease" }}
                    />
                    <text
                      x={p.x}
                      y={p.y + 3}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize="8.5"
                      fill={on ? s.color : "rgba(255,255,255,0.45)"}
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
              <span className="font-mono text-[11px] tracking-[0.14em]" style={{ color: STEPS[active].color }}>
                STEP 0{active + 1} / 06
              </span>
              <span className="mt-2 font-display text-[17px] font-medium leading-snug tracking-[-0.02em] sm:text-[19px]" aria-live="polite">
                {STEPS[active].title}
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
                    className="group grid w-full grid-cols-[2.5rem_1fr] items-baseline gap-x-3 py-4 text-left sm:py-5"
                  >
                    <span className="font-mono text-[11px] tracking-[0.1em] transition-colors" style={{ color: on ? s.color : "var(--mk-dim)" }}>
                      0{i + 1}
                    </span>
                    <span>
                      <span
                        className={`block text-[16.5px] tracking-[-0.015em] transition-colors sm:text-[18px] ${
                          on ? "text-[color:var(--mk-text)]" : "text-[color:var(--mk-muted)] group-hover:text-[color:var(--mk-text)]"
                        }`}
                      >
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
