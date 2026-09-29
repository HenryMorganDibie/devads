import { Container, Eyebrow, Reveal, Section } from "./primitives";

const PARTIES = [
  { who: "Developers", get: "Rewards", note: "Credits, discounts and access, funded by sponsors.", color: "text-value", bar: "bg-value" },
  { who: "Sponsors", get: "Qualified developer engagement", note: "Measured outcomes instead of anonymous impressions.", color: "text-signal", bar: "bg-signal" },
  { who: "DevAds", get: "Platform fees", note: "For running sponsorships, verification, rewards and reporting.", color: "text-bone", bar: "bg-bone" },
];

export function BusinessModel() {
  return (
    <Section id="business-model" labelledBy="business-title">
      <Container>
        <Eyebrow index="13">Business model</Eyebrow>
        <h2 id="business-title" className="mk-h2 mt-6">
          Everyone gets something.
        </h2>

        <ul className="mt-16 grid gap-px overflow-hidden rounded-[16px] border border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
          {PARTIES.map((p, i) => (
            <Reveal as="li" key={p.who} delay={i * 90} className="flex flex-col bg-[#0a0b0d] p-6 sm:p-8">
              <span aria-hidden className={`h-[3px] w-8 rounded-full ${p.bar}`} />
              <p className="mt-8 mk-eyebrow">{p.who} get</p>
              <p className={`mt-3 font-display text-[26px] font-medium leading-[1.1] tracking-[-0.03em] sm:text-[30px] ${p.color}`}>{p.get}</p>
              <p className="mt-4 text-[14.5px] leading-relaxed text-[color:var(--mk-muted)]">{p.note}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-12 grid gap-8 lg:grid-cols-12">
          <p className="text-[17px] leading-relaxed text-[color:var(--mk-muted)] lg:col-span-6">
            Sponsors fund campaigns. DevAds takes a platform fee for providing the infrastructure that manages
            sponsorships, verification, rewards and reporting.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[12.5px] lg:col-span-6 lg:justify-end">
            <span className="rounded-md border border-fund/30 px-2.5 py-1.5 text-fund">Sponsor charge</span>
            <span className="text-[color:var(--mk-dim)]">=</span>
            <span className="rounded-md border border-value/30 px-2.5 py-1.5 text-value">Developer reward</span>
            <span className="text-[color:var(--mk-dim)]">+</span>
            <span className="rounded-md border border-white/20 px-2.5 py-1.5 text-bone">Platform fee</span>
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
