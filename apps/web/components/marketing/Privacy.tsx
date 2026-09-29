import { Check, Container, Cross, Eyebrow, PreviewTag, Reveal, Section } from "./primitives";

const NEVER = ["Source code", "Prompts", "Model responses", "Secrets", "Credentials"];

const LOCAL = [
  { label: "src/", w: ["w-24", "w-40", "w-32"] },
  { label: "prompt", w: ["w-44", "w-28"] },
  { label: "model response", w: ["w-36", "w-48", "w-20"] },
  { label: ".env", w: ["w-28"] },
];

const PAYLOAD: Array<[string, string]> = [
  ["clientType", '"VS_CODE"'],
  ["clientVersion", '"0.1.0"'],
  ["sessionId", '"ses_…"'],
  ["displayEventId", '"evt_…"'],
  ["type", '"OFFER_OPENED"'],
];

export function Privacy() {
  return (
    <Section id="privacy" labelledBy="privacy-title" className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-value/40 to-transparent"
      />
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow index="05" className="justify-center">
            Developer privacy
          </Eyebrow>
          <h2 id="privacy-title" className="mk-h2 mt-6">
            Sponsorship should never mean surveillance.
          </h2>
          <p className="mk-lede mx-auto mt-7 max-w-xl">
            DevAds is designed to provide sponsorship without becoming part of the developer&rsquo;s private coding or
            AI conversations.
          </p>
        </div>

        <Reveal className="mt-16">
          <div className="mk-panel grid overflow-hidden lg:grid-cols-[1fr_auto_1fr]">
            {/* What stays with the developer */}
            <div className="p-6 sm:p-8">
              <p className="mk-eyebrow">Your session</p>
              <ul className="mt-6 space-y-4" aria-label="Private session content, not part of any sponsorship request">
                {LOCAL.map((row) => (
                  <li key={row.label} className="flex items-start gap-4">
                    <span className="w-28 shrink-0 pt-0.5 font-mono text-[11.5px] text-[color:var(--mk-muted)]">{row.label}</span>
                    <span aria-hidden className="flex flex-wrap gap-1.5">
                      {row.w.map((w, i) => (
                        <span key={i} className={`h-3.5 ${w} rounded-[3px] bg-white/[0.07]`} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 flex items-center gap-2 text-[13px] text-[color:var(--mk-muted)]">
                <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                Not required by the sponsorship protocol
              </p>
            </div>

            {/* The boundary */}
            <div aria-hidden className="relative hidden w-24 lg:block">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.08]" />
              <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-value/30 bg-[#0b0c0e] text-value">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                  <path d="M8 1.8l5 2v4.1c0 3-2.1 5.3-5 6.3-2.9-1-5-3.3-5-6.3V3.8l5-2z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </div>
            </div>
            <div aria-hidden className="h-px bg-white/[0.08] lg:hidden" />

            {/* What a sponsorship interaction carries */}
            <div className="min-w-0 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="mk-eyebrow">A sponsorship event</p>
                <PreviewTag>Illustrative</PreviewTag>
              </div>
              <pre className="mt-6 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/30 p-4 font-mono text-[12.5px] leading-[1.8]">
                <code>
                  <span className="text-[color:var(--mk-dim)]">{"{"}</span>
                  {"\n"}
                  {PAYLOAD.map(([k, v], i) => (
                    <span key={k}>
                      {"  "}
                      <span className="text-signal">{k}</span>
                      <span className="text-[color:var(--mk-dim)]">: </span>
                      <span className="text-value">{v}</span>
                      {i < PAYLOAD.length - 1 ? <span className="text-[color:var(--mk-dim)]">,</span> : null}
                      {"\n"}
                    </span>
                  ))}
                  <span className="text-[color:var(--mk-dim)]">{"}"}</span>
                </code>
              </pre>
              <p className="mt-4 text-[13px] leading-relaxed text-[color:var(--mk-muted)]">
                Coarse, allowlisted metadata about the interaction. Nothing about what you are building.
              </p>
            </div>
          </div>
        </Reveal>

        <ul className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3 lg:grid-cols-6">
          {NEVER.map((item) => (
            <li key={item} className="flex items-center gap-2.5 bg-[#0a0b0d] px-4 py-4 text-[14px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-[color:var(--mk-muted)]">
                <Cross className="h-2.5 w-2.5" />
              </span>
              No {item.toLowerCase()}
            </li>
          ))}
          <li className="flex items-center gap-2.5 bg-[#0a0b0d] px-4 py-4 text-[14px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-value/30 text-value">
              <Check className="h-2.5 w-2.5" />
            </span>
            Developer controlled
          </li>
        </ul>
      </Container>
    </Section>
  );
}
