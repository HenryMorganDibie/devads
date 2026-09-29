import { Container, Eyebrow, FLOW_HEX, Reveal, Section, type Flow } from "./primitives";

const TRADITIONAL = ["Company", "Advertisement", "Impression"];

const DEVADS: Array<{ label: string; note: string; flow: Flow | "neutral" }> = [
  { label: "Company", note: "Funds a sponsorship", flow: "fund" },
  { label: "Sponsorship", note: "An offer with a real reward", flow: "fund" },
  { label: "Developer value", note: "Credits, discounts, access", flow: "value" },
  { label: "Verified engagement", note: "A measurable outcome", flow: "signal" },
];

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 ${className}`} fill="none">
      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NewModel() {
  return (
    <Section id="model" labelledBy="model-title">
      <Container>
        <Eyebrow index="02">A new model</Eyebrow>
        <h2 id="model-title" className="mk-h2 mt-6 max-w-4xl">
          Don&rsquo;t just advertise to developers. <span className="text-value">Sponsor them.</span>
        </h2>

        <div className="mt-16 grid gap-4 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <div className="flex h-full flex-col rounded-[14px] border border-dashed border-white/[0.09] p-6">
              <p className="mk-eyebrow">Traditional</p>
              <ol className="mt-8 flex flex-1 flex-col gap-2">
                {TRADITIONAL.map((step, i) => (
                  <li key={step} className="flex flex-col">
                    <span className="rounded-lg border border-white/[0.06] px-4 py-3 text-[14px] text-[color:var(--mk-muted)]">{step}</span>
                    {i < TRADITIONAL.length - 1 && <span aria-hidden className="ml-6 h-4 w-px bg-white/10" />}
                  </li>
                ))}
              </ol>
              <p className="mt-8 text-[13.5px] leading-relaxed text-[color:var(--mk-dim)]">
                Value is measured in impressions.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-8">
            <div className="mk-panel relative flex h-full flex-col overflow-hidden p-6 sm:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(98,223,168,0.12), transparent 70%)" }}
              />
              <p className="mk-eyebrow relative">
                <span className="text-[color:var(--mk-text)]">DevAds</span> &middot; Sponsorship
              </p>
              <ol className="relative mt-8 grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-0">
                {DEVADS.map((step, i) => {
                  const color = step.flow === "neutral" ? "#edece8" : FLOW_HEX[step.flow];
                  return (
                    <li key={step.label} className="relative flex xl:pr-6">
                      <div className="flex w-full flex-col rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 xl:min-h-[150px]">
                        <span className="font-mono text-[10.5px] tracking-[0.1em]" style={{ color }}>
                          0{i + 1}
                        </span>
                        <span className="mt-auto pt-4 text-[17px] xl:pt-8 font-medium tracking-[-0.02em]">{step.label}</span>
                        <span className="mt-1 text-[13px] text-[color:var(--mk-muted)]">{step.note}</span>
                        <span aria-hidden className="mt-4 h-[2px] w-8 rounded-full" style={{ background: color }} />
                      </div>
                      {i < DEVADS.length - 1 && (
                        <Chevron className="absolute right-[5px] top-1/2 hidden -translate-y-1/2 text-white/25 xl:block" />
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="relative mt-8 max-w-xl text-[14.5px] leading-relaxed text-[color:var(--mk-muted)]">
                Value is measured by what the developer received and what they actually did. The sponsor pays for an
                outcome; the developer is the one who benefits.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
