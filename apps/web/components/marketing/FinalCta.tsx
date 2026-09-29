import Link from "next/link";
import { LINKS } from "../../lib/site";
import { ArrowRight, Container } from "./primitives";

const PATHS = [
  { side: "Developers", label: "Join as a developer", href: LINKS.signUp, color: "#62dfa8", note: "Opt in and receive rewards while you build." },
  { side: "Sponsors", label: "Sponsor developers", href: LINKS.sponsor, color: "#f0b35b", note: "Fund value for the developers you want to reach." },
  { side: "Platforms", label: "Build an integration", href: LINKS.docs ?? "#protocol", color: "#7ea6ff", note: "Bring sponsorships into your developer tool." },
];

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden border-t border-white/[0.06] py-28 sm:py-40">
      <div aria-hidden className="mk-grid-bg pointer-events-none absolute inset-0 opacity-70" />
      <svg aria-hidden viewBox="0 0 1200 400" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full opacity-60">
        <path d="M0 400 C 300 400, 420 120, 600 120" fill="none" stroke="#f0b35b" strokeOpacity="0.25" />
        <path d="M600 120 C 780 120, 900 400, 1200 400" fill="none" stroke="#62dfa8" strokeOpacity="0.25" />
        <path d="M600 400 L 600 120" fill="none" stroke="#7ea6ff" strokeOpacity="0.25" />
        <circle cx="600" cy="120" r="3" fill="#f3f1ec" />
      </svg>

      <Container className="relative">
        <div className="mx-auto max-w-5xl text-center">
          <h2 id="cta-title" className="font-display text-[clamp(2.75rem,1.2rem+5.6vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.045em]">
            Build something.
            <span className="block text-[color:var(--mk-dim)]">Let someone sponsor it.</span>
          </h2>
          <p className="mk-lede mx-auto mt-8 max-w-xl">
            DevAds is building the infrastructure that connects developer attention with developer value.
          </p>
        </div>

        <ul className="mx-auto mt-16 grid max-w-5xl gap-3 md:grid-cols-3">
          {PATHS.map((p, i) => {
            const inner = (
              <>
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: p.color }}>
                    {p.side}
                  </span>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                </span>
                <span className="mt-10 flex items-center justify-between gap-3 text-[18px] font-medium tracking-[-0.02em]">
                  {p.label}
                  <ArrowRight className="h-4 w-4 text-[color:var(--mk-muted)] group-hover:text-white" />
                </span>
                <span className="mt-1.5 block text-[13.5px] text-[color:var(--mk-muted)]">{p.note}</span>
              </>
            );
            const cls = `mk-btn-card group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-[#0b0c0e]/90 p-6 backdrop-blur transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-[#0e0f12] ${
              i === 0 ? "border-white/20" : "border-white/[0.08] hover:border-white/20"
            }`;
            return (
              <li key={p.side}>
                {p.href.startsWith("#") ? (
                  <a href={p.href} className={`${cls} [&_.mk-arrow]:transition-transform hover:[&_.mk-arrow]:translate-x-[3px]`}>
                    {inner}
                  </a>
                ) : (
                  <Link href={p.href} className={`${cls} [&_.mk-arrow]:transition-transform hover:[&_.mk-arrow]:translate-x-[3px]`}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
