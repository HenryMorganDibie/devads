import { Container, Eyebrow, Reveal, Section } from "./primitives";

// Keep in sync with the README's "Status" section and docs/adapters.md.
const COLUMNS: Array<{ label: string; tone: string; items: string[] }> = [
  {
    label: "Implemented",
    tone: "text-value border-value/30",
    items: [
      "Sponsorship campaigns with sponsor and admin review",
      "Server-side offer selection, budgets, caps and verification",
      "Idempotent sponsor charges in integer cents",
      "Reward ledger and developer wallet",
      "@devads/ad-sdk protocol SDK and adapter runtime",
      "VS Code extension, the first client",
      "Wait-time sponsored cards in VS Code, the first use case",
    ],
  },
  {
    label: "Early",
    tone: "text-fund border-fund/30",
    items: [
      "Reward redemption, fulfilled by an operator",
      "Stripe billing and payouts, test mode behind configuration",
      "Hosted public API",
    ],
  },
  {
    label: "Planned",
    tone: "text-[color:var(--mk-muted)] border-white/15",
    items: [
      "Adapters for AI coding agents, CLIs and other IDEs",
      "Automated fraud detection and reward reversals",
      "More reward types delivered automatically",
    ],
  },
];

export function Status() {
  return (
    <Section id="status" labelledBy="status-title">
      <Container>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow index="12">Status</Eyebrow>
            <h2 id="status-title" className="mk-h2 mt-6">
              Where DevAds is today.
            </h2>
          </div>
          <p className="mk-lede self-end lg:col-span-4 lg:col-start-9">
            DevAds is an early product. Here is exactly what is built, what is early and what is still planned.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[16px] border border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
          {COLUMNS.map((col, i) => (
            <Reveal key={col.label} delay={i * 80} className="bg-[#0a0b0d] p-6 sm:p-8">
              <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] ${col.tone}`}>
                {col.label}
              </span>
              <ul className="mt-6 space-y-3">
                {col.items.map((item) => (
                  <li key={item} className="flex gap-3 text-[14.5px] leading-snug text-[color:var(--mk-text)]/90">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-[color:var(--mk-muted)]">
          <span className="text-[color:var(--mk-text)]">Partnerships: none.</span> DevAds has no partnership with any AI
          provider or developer-tool company, and none is needed for the sponsorship loop to work.
        </p>
      </Container>
    </Section>
  );
}
