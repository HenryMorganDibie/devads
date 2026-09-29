import type { ReactNode } from "react";
import { Check, Container, Eyebrow, Reveal, Section } from "./primitives";

function Toggle() {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d10] px-4 py-3">
      <span className="text-[13px] text-[color:var(--mk-muted)]">Sponsored opportunities</span>
      <span className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--mk-dim)]">Opt-in</span>
        <span aria-hidden className="relative h-[18px] w-8 rounded-full bg-value/80">
          <span className="absolute right-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-[#08090a]" />
        </span>
      </span>
    </div>
  );
}

function Funding() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0c0d10] px-4 py-3">
      <span className="font-mono text-[11px] text-fund">Sponsor</span>
      <span aria-hidden className="h-[2px] flex-1 rounded-full bg-gradient-to-r from-fund to-value" />
      <span className="font-mono text-[11px] text-value">Developer</span>
    </div>
  );
}

function Outcome() {
  const steps = ["Displayed", "Opened", "Completed"];
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0c0d10] px-3 py-3">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
              i === steps.length - 1 ? "bg-signal/[0.12] text-signal" : "text-[color:var(--mk-muted)]"
            }`}
          >
            {i === steps.length - 1 && <Check className="h-3 w-3" />}
            {s}
          </span>
          {i < steps.length - 1 && <span aria-hidden className="h-px w-3 bg-white/15" />}
        </span>
      ))}
    </div>
  );
}

function Sockets() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0c0d10] px-4 py-3">
      <div className="flex justify-between gap-2">
        {["IDE", "CLI", "Agent", "Platform"].map((c) => (
          <span key={c} className="flex-1 rounded-md border border-white/[0.08] py-1 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--mk-muted)]">
            {c}
          </span>
        ))}
      </div>
      <div aria-hidden className="mt-2 h-[3px] rounded-full bg-gradient-to-r from-signal/20 via-signal/70 to-signal/20" />
    </div>
  );
}

const PRINCIPLES: Array<{ title: string; body: string; visual: ReactNode }> = [
  { title: "Developer controlled", body: "Participation is opt-in, and every opportunity can be skipped.", visual: <Toggle /> },
  { title: "Sponsor funded", body: "Sponsors provide the economic value. Developers never pay to participate.", visual: <Funding /> },
  { title: "Outcome focused", body: "Sponsors can pay for meaningful developer engagement, not for being seen.", visual: <Outcome /> },
  { title: "Platform ready", body: "The infrastructure is designed to work across different developer tools.", visual: <Sockets /> },
];

export function Principles() {
  return (
    <Section id="principles" labelledBy="principles-title">
      <Container>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Eyebrow index="09">Why DevAds</Eyebrow>
            <h2 id="principles-title" className="mk-h2 mt-6">
              Built around the developer.
            </h2>
          </div>
          <p className="mk-lede self-end lg:col-span-4 lg:col-start-9">
            Four commitments that shape every decision in the product, from the protocol to the wallet.
          </p>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-[16px] border border-white/[0.07] bg-white/[0.07] md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 80} className="flex flex-col bg-[#0a0b0d] p-6 sm:p-9">
              <div className="flex items-start justify-between gap-6">
                <span className="font-display text-[56px] font-medium leading-none tracking-[-0.05em] text-white/[0.08] sm:text-[72px]">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 font-display text-[24px] font-medium tracking-[-0.025em] sm:text-[28px]">{p.title}</h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[color:var(--mk-muted)]">{p.body}</p>
              <div className="mt-8 max-w-sm">{p.visual}</div>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
