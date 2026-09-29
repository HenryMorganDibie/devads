import Link from "next/link";
import { LINKS } from "../../lib/site";
import { ArrowRight, Container, Eyebrow, Reveal, Section } from "./primitives";
import { SponsorWorkbench } from "./SponsorWorkbench";

const CATEGORIES = ["AI", "Cloud", "Fintech", "Infrastructure", "Cybersecurity", "SaaS", "Telecom", "Education", "Hardware", "Events"];

export function Sponsors() {
  return (
    <Section id="sponsors" labelledBy="sponsors-title">
      <Container>
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Eyebrow index="06">For sponsors</Eyebrow>
            <h2 id="sponsors-title" className="mk-h2 mt-6">
              Turn your developer marketing budget into <span className="text-fund">developer value.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-end gap-6 lg:col-span-4">
            <p className="mk-lede">
              Instead of buying another anonymous impression, sponsor something developers actually care about.
            </p>
            <Link href={LINKS.sponsor} className="mk-btn mk-btn-ghost self-start">
              Sponsor developers <ArrowRight />
            </Link>
          </div>
        </div>

        <Reveal className="mt-16">
          <SponsorWorkbench />
        </Reveal>

        <div className="mt-24 grid gap-10 border-t border-white/[0.06] pt-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="mk-eyebrow">Who can sponsor</p>
            <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-[color:var(--mk-muted)]">
              DevAds is not limited to developer-tool companies. Any legitimate organization that wants to reach
              developers can fund value for them.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mk-dim)]">
              Categories, not customers
            </p>
          </div>
          <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:col-span-8" aria-label="Potential sponsor categories">
            {CATEGORIES.map((c, i) => (
              <Reveal as="li" key={c} delay={i * 50} className="flex items-baseline gap-3">
                <span className="font-display text-[clamp(1.75rem,1.2rem+2.4vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.035em] text-[color:var(--mk-muted)] transition-colors duration-300 hover:text-[color:var(--mk-text)]">
                  {c}
                </span>
                {i < CATEGORIES.length - 1 && (
                  <span aria-hidden className="text-[clamp(1.25rem,1rem+1.2vw,2rem)] text-white/15">
                    /
                  </span>
                )}
              </Reveal>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
