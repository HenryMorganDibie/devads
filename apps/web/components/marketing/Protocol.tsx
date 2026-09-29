import { Container, Eyebrow, Reveal, Section } from "./primitives";

// Mirrors CLIENT_INTEGRATIONS in packages/ad-sdk/src/adapter/integrations.ts:
// VS Code is the only implemented client. The rest are client types the
// protocol can represent, not integrations or partnerships.
const CLIENTS: Array<{ name: string; state: "available" | "potential" }> = [
  { name: "VS Code", state: "available" },
  { name: "Claude Code", state: "potential" },
  { name: "Codex", state: "potential" },
  { name: "Cursor", state: "potential" },
  { name: "Gemini", state: "potential" },
  { name: "OpenCode", state: "potential" },
  { name: "Aider", state: "potential" },
  { name: "Custom agent", state: "potential" },
];

const CORE = ["Campaigns", "Rewards", "Events"];

function Tok({ c, children }: { c: "k" | "s" | "f" | "m" | "p"; children: React.ReactNode }) {
  const color = { k: "text-[#c39bff]", s: "text-value", f: "text-signal", m: "text-[color:var(--mk-dim)]", p: "text-[color:var(--mk-text)]" }[c];
  return <span className={color}>{children}</span>;
}

function Stem() {
  return <span aria-hidden className="mx-auto block h-7 w-px bg-gradient-to-b from-white/10 to-white/25" />;
}

export function Protocol() {
  return (
    <Section id="protocol" labelledBy="protocol-title" bordered={false} className="!pt-0">
      <Container>
        <div className="border-t border-white/[0.06] pt-24 sm:pt-32">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Eyebrow index="08">The protocol</Eyebrow>
              <h2 id="protocol-title" className="mk-h2 mt-6">
                One sponsorship layer. <span className="text-[color:var(--mk-dim)]">Many developer clients.</span>
              </h2>
            </div>
            <p className="mk-lede self-end lg:col-span-4 lg:col-start-9">
              Developer tools can connect to DevAds without DevAds needing to own the developer experience. A client
              asks for an opportunity, renders it its own way, and reports what the developer chose to do.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-12 lg:gap-8">
            <Reveal className="min-w-0 lg:col-span-6">
              <div className="flex h-full flex-col">
                <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#0b0c0f]">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                    <span className="font-mono text-[11px] text-[color:var(--mk-muted)]">agent.ts</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--mk-dim)]">@devads/ad-sdk</span>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.75] sm:p-5 sm:text-[12.5px]">
                    <code>
                      <Tok c="k">import</Tok> <Tok c="p">{"{ DevAdsClient }"}</Tok> <Tok c="k">from</Tok> <Tok c="s">&quot;@devads/ad-sdk&quot;</Tok>;{"\n\n"}
                      <Tok c="k">const</Tok> <Tok c="p">devads</Tok> = <Tok c="k">new</Tok> <Tok c="f">DevAdsClient</Tok>({"{"}{"\n"}
                      {"  "}baseUrl,{"\n"}
                      {"  "}credentials: {"{"} token {"}"},{"\n"}
                      {"}"});{"\n\n"}
                      <Tok c="k">const</Tok> session = <Tok c="k">await</Tok> devads.<Tok c="f">startSession</Tok>({"{"}{"\n"}
                      {"  "}clientType: <Tok c="s">&quot;CUSTOM_AGENT&quot;</Tok>,{"\n"}
                      {"}"});{"\n\n"}
                      <Tok c="k">const</Tok> offer = <Tok c="k">await</Tok> devads.<Tok c="f">requestSponsoredOpportunity</Tok>({"{"}{"\n"}
                      {"  "}sessionId: session.id,{"\n"}
                      {"}"});{"\n\n"}
                      <Tok c="m">{"// Render it in your own UI. Once the developer"}</Tok>{"\n"}
                      <Tok c="m">{"// completes the sponsor's action:"}</Tok>{"\n"}
                      <Tok c="k">if</Tok> (offer) {"{"}{"\n"}
                      {"  "}<Tok c="k">await</Tok> devads.<Tok c="f">completeQualifyingAction</Tok>({"{"}{"\n"}
                      {"    "}displayEventId: offer.displayEventId,{"\n"}
                      {"  "}{"}"});{"\n"}
                      {"}"}
                    </code>
                  </pre>
                </div>
                <ul className="mt-6 grid gap-3 text-[13.5px] text-[color:var(--mk-muted)] sm:grid-cols-3 lg:mt-auto lg:pt-6">
                  <li className="border-t border-white/[0.08] pt-3">
                    <span className="block text-[color:var(--mk-text)]">Server-authoritative</span>
                    Rewards, pricing and eligibility never come from the client.
                  </li>
                  <li className="border-t border-white/[0.08] pt-3">
                    <span className="block text-[color:var(--mk-text)]">Idempotent</span>
                    Every event carries a key, so a retry can&rsquo;t reward twice.
                  </li>
                  <li className="border-t border-white/[0.08] pt-3">
                    <span className="block text-[color:var(--mk-text)]">Coarse by design</span>
                    No field exists for code, prompts or model output.
                  </li>
                </ul>
              </div>
            </Reveal>

            <Reveal delay={120} className="min-w-0 lg:col-span-6">
              <figure className="mk-panel mk-dots p-5 sm:p-8" aria-label="Conceptual diagram of the DevAds protocol stack">
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CLIENTS.map((c) => (
                    <li
                      key={c.name}
                      className={`rounded-lg border px-2 py-2.5 text-center ${
                        c.state === "available" ? "border-value/35 bg-value/[0.06]" : "border-dashed border-white/[0.12] bg-[#0c0d10]"
                      }`}
                    >
                      <p className="text-[13px] tracking-[-0.01em]">{c.name}</p>
                      <p className={`mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${c.state === "available" ? "text-value" : "text-[color:var(--mk-dim)]"}`}>
                        {c.state === "available" ? "Available" : "Potential"}
                      </p>
                    </li>
                  ))}
                </ul>

                <svg viewBox="0 0 500 40" preserveAspectRatio="none" className="hidden h-10 w-full sm:block" aria-hidden>
                  {[62.5, 187.5, 312.5, 437.5].map((x) => (
                    <path key={x} d={`M${x} 0 C ${x} 24, 250 16, 250 40`} fill="none" stroke="rgba(255,255,255,0.18)" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                <div className="sm:hidden">
                  <Stem />
                </div>

                <div className="rounded-xl border border-signal/35 bg-[#0d0f14] px-4 py-3.5 text-center shadow-[0_0_50px_-24px_rgba(126,166,255,0.6)]">
                  <p className="font-display text-[16px] font-medium tracking-[-0.01em]">DevAds Protocol</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">Client SDK &middot; adapters</p>
                </div>
                <Stem />
                <div className="rounded-xl border border-white/[0.12] bg-[#0f1013] px-4 py-3.5 text-center">
                  <p className="font-display text-[16px] font-medium tracking-[-0.01em]">DevAds Core</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--mk-dim)]">Eligibility &middot; verification &middot; accounting</p>
                </div>
                <Stem />
                <ul className="grid grid-cols-3 gap-2">
                  {CORE.map((c) => (
                    <li key={c} className="rounded-lg border border-white/[0.08] bg-[#0c0d10] px-2 py-2.5 text-center text-[13px] text-[color:var(--mk-muted)]">
                      {c}
                    </li>
                  ))}
                </ul>
                <Stem />
                <div className="rounded-xl border border-fund/30 bg-fund/[0.05] px-4 py-3.5 text-center">
                  <p className="font-display text-[16px] font-medium tracking-[-0.01em] text-fund">Sponsors</p>
                </div>

                <figcaption className="mt-6 text-[11.5px] leading-relaxed text-[color:var(--mk-dim)]">
                  Conceptual. The VS Code extension is the only client connected today. Other names identify potential
                  client types the protocol can represent; no integration, partnership or endorsement is implied.
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
