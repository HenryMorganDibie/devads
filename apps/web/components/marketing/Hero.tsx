import { ArrowRight, Container } from "./primitives";
import { HeroSystem } from "./HeroSystem";
import { HeroOpportunityCard } from "./HeroOpportunityCard";

const LEGEND = [
  { color: "bg-fund", label: "Sponsor funding" },
  { color: "bg-value", label: "Developer value" },
  { color: "bg-signal", label: "Verified engagement" },
];

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden pb-20 pt-28 sm:pb-28 sm:pt-32">
      <div aria-hidden className="mk-grid-bg pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[8%] h-[640px] w-[640px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(98,223,168,0.07), rgba(126,166,255,0.04) 45%, transparent 70%)" }}
      />

      <Container className="relative">
        <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="mk-eyebrow flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="mk-pulse absolute inset-0 rounded-full bg-value" />
                <span className="relative h-2 w-2 rounded-full bg-value/60" />
              </span>
              The sponsorship layer for modern development
            </p>

            <h1
              id="hero-title"
              className="mt-7 font-display font-semibold leading-[0.94] tracking-[-0.04em] text-[clamp(3rem,1.2rem+7.4vw,6.25rem)] lg:text-[clamp(4rem,8.2vw,6.25rem)]"
            >
              <span className="block">Build with AI.</span>
              <span className="block bg-gradient-to-r from-bone via-bone to-value bg-clip-text pb-2 text-transparent">
                Get sponsored.
              </span>
            </h1>

            <div className="mt-8 max-w-[34rem] space-y-4">
              <p className="text-[clamp(1.0625rem,1rem+0.35vw,1.25rem)] leading-[1.55] tracking-[-0.01em] text-[color:var(--mk-text)]/90">
                DevAds connects companies that want to reach developers with developers who want more value from the
                tools they use to build.
              </p>
              <p className="mk-lede">
                Companies fund sponsorships. Developers receive rewards. DevAds handles everything in between.
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a href="#developers" className="mk-btn mk-btn-primary">
                For developers <ArrowRight />
              </a>
              <a href="#sponsors" className="mk-btn mk-btn-ghost">
                For companies <ArrowRight />
              </a>
            </div>

            <ul className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.06] pt-6" aria-label="Diagram legend">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mk-muted)]">
                  <span className={`h-[3px] w-4 rounded-full ${l.color}`} />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative lg:col-span-5">
            <div className="mk-panel mk-dots relative px-4 pb-12 pt-2 sm:px-8 sm:pb-14 sm:pt-3">
              <HeroSystem />
            </div>
            {/* The card straddles the panel edge under the Developer node: it is what the developer sees. */}
            <div className="relative z-10 -mt-10 flex flex-col items-center">
              <span aria-hidden className="h-5 w-px bg-gradient-to-b from-value/0 to-value/50" />
              <HeroOpportunityCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
