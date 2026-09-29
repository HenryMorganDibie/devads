import { Container, Eyebrow, Reveal, Section } from "./primitives";

const CLIENTS = [
  { name: "IDE", note: "First client: VS Code extension", live: true },
  { name: "AI coding agent", note: "Designed for" },
  { name: "CLI", note: "Designed for" },
  { name: "Developer platform", note: "Designed for" },
  { name: "Custom or local agent", note: "Designed for" },
];

const OUTPUTS = [
  { name: "Sponsorship", note: "Offers matched to eligible developers", color: "text-fund" },
  { name: "Rewards", note: "Credited to the developer's wallet", color: "text-value" },
];

// Convergence lines for the desktop diagram, in a 100 x 100 box.
const YS = [10, 30, 50, 70, 90];

export function Platforms() {
  return (
    <Section id="platforms" labelledBy="platforms-title">
      <Container>
        <div className="max-w-3xl">
          <Eyebrow index="07">For platforms</Eyebrow>
          <h2 id="platforms-title" className="mk-h2 mt-6">
            Add sponsored developer experiences through the <span className="text-signal">DevAds protocol.</span>
          </h2>
          <p className="mk-lede mt-7 max-w-xl">
            DevAds is designed as an infrastructure layer that IDEs, AI coding agents, CLIs and developer tools can
            eventually integrate. The platform keeps its product and its user experience; DevAds supplies campaigns,
            verification, rewards and wallets underneath.
          </p>
        </div>

        <Reveal className="mt-16">
          <div className="mk-panel mk-dots overflow-hidden p-5 sm:p-8">
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(3rem,1fr)_auto_minmax(3rem,1fr)_minmax(0,15rem)]">
              {/* clients */}
              <div>
                <p className="mk-eyebrow mb-4">Potential integrations</p>
                <ul className="space-y-2">
                  {CLIENTS.map((c) => (
                    <li
                      key={c.name}
                      className={`rounded-xl border px-4 py-3 ${c.live ? "border-value/30 bg-value/[0.05]" : "border-white/[0.08] bg-[#0c0d10]"}`}
                    >
                      <p className="text-[14.5px] tracking-[-0.01em]">{c.name}</p>
                      <p className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${c.live ? "text-value" : "text-[color:var(--mk-dim)]"}`}>
                        {c.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* converge */}
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="hidden h-full min-h-[340px] w-full lg:block" aria-hidden>
                {YS.map((y) => (
                  <path key={y} d={`M0 ${y} C 55 ${y}, 45 50, 100 50`} fill="none" stroke="rgba(126,166,255,0.55)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="mk-flow-dash" />
                ))}
              </svg>
              <div aria-hidden className="mx-auto h-8 w-px bg-gradient-to-b from-white/5 to-signal/50 lg:hidden" />

              {/* protocol */}
              <div className="relative mx-auto w-full max-w-[15rem] rounded-2xl border border-signal/30 bg-[#0d0f14] p-5 text-center shadow-[0_0_60px_-20px_rgba(126,166,255,0.45)] lg:w-52">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Protocol</p>
                <p className="mt-2 font-display text-[20px] font-medium tracking-[-0.02em]">DevAds Protocol</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[color:var(--mk-muted)]">
                  Sessions, opportunities, events and wallets through one client SDK.
                </p>
              </div>

              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="hidden h-full min-h-[340px] w-full lg:block" aria-hidden>
                {[32, 68].map((y) => (
                  <path key={y} d={`M0 50 C 55 50, 45 ${y}, 100 ${y}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="mk-flow-dash" />
                ))}
              </svg>
              <div aria-hidden className="mx-auto h-8 w-px bg-gradient-to-b from-signal/50 to-white/5 lg:hidden" />

              {/* outputs */}
              <ul className="space-y-3">
                {OUTPUTS.map((o) => (
                  <li key={o.name} className="rounded-xl border border-white/[0.08] bg-[#0c0d10] px-4 py-4">
                    <p className={`text-[15px] tracking-[-0.01em] ${o.color}`}>{o.name}</p>
                    <p className="mt-1 text-[12.5px] text-[color:var(--mk-muted)]">{o.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
