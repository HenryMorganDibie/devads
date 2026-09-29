import { Container, Eyebrow, Reveal, Section } from "./primitives";

const LAYERS = [
  { name: "Sponsors", what: "Organizations fund sponsorship campaigns", how: "Accounts and membership", color: "#f0b35b" },
  { name: "Campaigns", what: "Budget, objective, reward, caps and schedule", how: "Reviewed before serving" },
  { name: "Targeting", what: "Eligibility by client, opt-outs and frequency caps", how: "Pure, tested rules engine" },
  { name: "DevAds core", what: "Selects offers and issues displays server-side", how: "Server-authoritative", strong: true },
  { name: "Verified engagement", what: "Every interaction keyed and deduplicated", how: "Idempotent event ids", color: "#7ea6ff" },
  { name: "Rewards", what: "Developer wallets backed by a reward ledger", how: "Ledger is the source of truth", color: "#62dfa8" },
  { name: "Accounting", what: "Sponsor spend and developer rewards reconciled", how: "Integer money, row-locked writes" },
];

export function Infrastructure() {
  return (
    <Section id="infrastructure" labelledBy="infra-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-8">
          <div className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <Eyebrow index="11">Infrastructure</Eyebrow>
            <h2 id="infra-title" className="mk-h2 mt-6">
              Under the experience is infrastructure.
            </h2>
            <p className="mk-lede mt-7 max-w-sm">
              The developer sees a simple experience. The complexity stays underneath.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            {/* surface */}
            <Reveal>
              <div className="flex items-center justify-between rounded-xl border border-white/[0.1] bg-[#0e0f12] px-4 py-3.5">
                <span className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-fund" />
                  <span className="text-[14px]">Sponsored opportunity</span>
                </span>
                <span className="font-mono text-[12px] text-value">+ reward</span>
              </div>
              <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--mk-dim)]">What the developer sees</p>
            </Reveal>

            <div aria-hidden className="relative my-8 flex items-center gap-4">
              <span className="h-px flex-1 border-t border-dashed border-white/15" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--mk-dim)]">Below the surface</span>
              <span className="h-px flex-1 border-t border-dashed border-white/15" />
            </div>

            <ol className="relative">
              <span aria-hidden className="mk-signal-line absolute bottom-4 left-[7px] top-4 w-px bg-white/[0.07]" />
              {LAYERS.map((l, i) => (
                <Reveal as="li" key={l.name} delay={i * 60} className="relative pl-9 [&+&]:mt-2">
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border bg-[#08090a]"
                    style={{ borderColor: l.color ? `${l.color}99` : "rgba(255,255,255,0.18)" }}
                  />
                  <div
                    className={`grid gap-1 rounded-xl border px-4 py-3.5 transition-colors sm:grid-cols-[10.5rem_1fr_auto] sm:items-center sm:gap-4 ${
                      l.strong ? "border-white/20 bg-white/[0.04]" : "border-white/[0.07] bg-[#0b0c0e] hover:border-white/[0.14]"
                    }`}
                  >
                    <span className="font-mono text-[11.5px] uppercase tracking-[0.12em]" style={{ color: l.color ?? "var(--mk-text)" }}>
                      {l.name}
                    </span>
                    <span className="text-[14px] text-[color:var(--mk-muted)]">{l.what}</span>
                    <span className="font-mono text-[10.5px] text-[color:var(--mk-dim)] sm:text-right">{l.how}</span>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </Container>
    </Section>
  );
}
