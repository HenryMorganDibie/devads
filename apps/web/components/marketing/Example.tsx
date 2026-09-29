import type { CSSProperties } from "react";
import { Container, Eyebrow, FLOW_HEX, PreviewTag, Section } from "./primitives";

const STEPS = [
  { actor: "Company", action: "Funds $10,000", color: FLOW_HEX.fund },
  { actor: "DevAds", action: "Creates the sponsorship campaign", color: "#edece8" },
  { actor: "Developer", action: "Chooses to participate", color: FLOW_HEX.value },
  { actor: "Developer", action: "Receives cloud credits", color: FLOW_HEX.value },
  { actor: "Sponsor", action: "Gets a verified engagement", color: FLOW_HEX.signal },
  { actor: "DevAds", action: "Keeps its platform fee", color: "#edece8" },
];

export function Example() {
  return (
    <Section id="example" labelledBy="example-title">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow index="10">Illustrative example</Eyebrow>
            <h2 id="example-title" className="mk-h2 mt-6">
              Imagine this.
            </h2>
            <p className="mk-lede mt-5 max-w-lg">A cloud company wants developers to try its platform.</p>
          </div>
          <PreviewTag>Illustrative example &middot; not a real campaign</PreviewTag>
        </div>

        <ol className="mk-seq relative mt-16 grid gap-0 md:grid-cols-3 xl:grid-cols-6">
          <span aria-hidden className="absolute left-[11px] top-3 h-[calc(100%-24px)] w-px bg-white/[0.08] md:hidden" />
          {STEPS.map((s, i) => (
            <li
              key={i}
              data-step=""
              style={{ "--i": i } as CSSProperties}
              className="relative pb-8 pl-10 md:pb-10 md:pl-0 md:pr-6"
            >
              <span aria-hidden className="absolute left-0 top-0.5 flex h-[23px] w-[23px] items-center justify-center rounded-full border bg-[#08090a] md:relative md:left-auto md:top-auto" style={{ borderColor: `${s.color}66` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              </span>
              <span aria-hidden className="absolute left-[30px] right-0 top-[12px] hidden h-px bg-gradient-to-r from-white/15 to-white/[0.03] md:block" />
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] md:mt-6" style={{ color: s.color }}>
                <span className="text-[color:var(--mk-dim)]">0{i + 1} &middot; </span>
                {s.actor}
              </p>
              <p className="mt-2 text-[17px] leading-snug tracking-[-0.015em] sm:text-[18px]">{s.action}</p>
            </li>
          ))}
        </ol>

        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[color:var(--mk-dim)]">
          A hypothetical scenario to show how the pieces fit together. The amount is illustrative and does not describe
          a real sponsor, campaign or result.
        </p>
      </Container>
    </Section>
  );
}
