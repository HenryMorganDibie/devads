"use client";

import { useEffect, useRef } from "react";
import { Container } from "./primitives";

const LINES = [
  { lead: "Impressions", rest: " are easy to buy.", tone: "text-[color:var(--mk-muted)]" },
  { lead: "Developer attention", rest: " is harder.", tone: "text-[color:var(--mk-text)]" },
  { lead: "Developer engagement", rest: " is valuable.", tone: "text-signal" },
  { lead: "Developer value", rest: " is even more powerful.", tone: "text-value" },
];

/**
 * A typographic moment. Each line brightens as it crosses the middle of the
 * viewport. With reduced motion (or no JavaScript) every line is fully lit.
 */
export function Crescendo() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = window.innerHeight * 0.62;
      for (const el of lines) {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const t = Math.max(0, Math.min(1, (mid + 140 - center) / 280));
        el.style.opacity = String(0.14 + 0.86 * t);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section aria-labelledby="crescendo-title" className="relative border-t border-white/[0.06] py-28 sm:py-44">
      <Container>
        <h2 id="crescendo-title" className="sr-only">
          From impression to value
        </h2>
        <div ref={ref}>
          {LINES.map((l) => (
            <p
              key={l.lead}
              data-line=""
              className="font-display text-[clamp(2rem,1rem+3.9vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.045em] transition-opacity duration-200 [&+&]:mt-4 sm:[&+&]:mt-6"
            >
              <span className={l.tone}>{l.lead}</span>
              <span className="text-[color:var(--mk-text)]">{l.rest}</span>
            </p>
          ))}
          <p data-line="" className="mt-14 flex items-center gap-4 sm:mt-20">
            <span aria-hidden className="flex">
              <span className="h-2.5 w-2.5 rounded-full bg-fund" />
              <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-signal" />
              <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-value" />
            </span>
            <span className="font-display text-[clamp(1.375rem,1rem+1.4vw,2.25rem)] font-medium tracking-[-0.03em]">
              DevAds connects all four.
            </span>
          </p>
        </div>
      </Container>
    </section>
  );
}
