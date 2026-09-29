import { Container, Eyebrow, Reveal, Section } from "./primitives";

const TOOLCHAIN = [
  { name: "AI coding agent", kind: "Subscription", width: "78%" },
  { name: "Model APIs", kind: "Usage-based", width: "64%" },
  { name: "Cloud infrastructure", kind: "Usage-based", width: "56%" },
  { name: "Developer tools", kind: "Per seat", width: "42%" },
];

export function Problem() {
  return (
    <Section id="thesis" labelledBy="thesis-title">
      <Container>
        <Eyebrow index="01">The shift</Eyebrow>
        <h2 id="thesis-title" className="mk-h2 mt-6 max-w-5xl">
          AI changed how developers build.{" "}
          <span className="text-[color:var(--mk-dim)]">It also changed what development costs.</span>
        </h2>
        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <p className="mk-lede max-w-md">
              Developers are using AI coding agents, APIs, cloud infrastructure and increasingly powerful developer
              tools every day. Those tools create enormous value, but they also create new costs.
            </p>
          </div>

          <Reveal className="lg:col-span-7 lg:col-start-6">
            <div className="mk-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <span className="mk-eyebrow">A modern developer&rsquo;s stack</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--mk-dim)]">Recurring</span>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {TOOLCHAIN.map((t, i) => (
                  <li key={t.name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 px-5 py-4 sm:grid-cols-[11rem_1fr_6.5rem]">
                    <span className="text-[14.5px] tracking-[-0.01em]">{t.name}</span>
                    <span className="order-3 col-span-2 h-[5px] overflow-hidden rounded-full bg-white/[0.05] sm:order-none sm:col-span-1">
                      <span
                        aria-hidden
                        data-grow=""
                        className="block h-full rounded-full bg-gradient-to-r from-white/20 to-white/60"
                        style={{ width: t.width, transitionDelay: `${200 + i * 120}ms` }}
                      />
                    </span>
                    <span className="text-right font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--mk-muted)]">{t.kind}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 border-t border-white/[0.06]">
                <div className="border-r border-white/[0.06] px-5 py-5">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-value">Output &uarr;</p>
                  <p className="mt-1.5 text-[15px] tracking-[-0.01em]">More productive</p>
                </div>
                <div className="px-5 py-5">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--mk-muted)]">Spend &uarr;</p>
                  <p className="mt-1.5 text-[15px] tracking-[-0.01em]">More recurring costs</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal className="mt-24 border-t border-white/[0.06] pt-12 sm:mt-32">
          <p className="max-w-5xl font-display text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-medium leading-[1.12] tracking-[-0.03em] text-[color:var(--mk-muted)] [text-wrap:balance]">
            What if companies could <span className="text-fund">help fund</span> that development, instead of simply{" "}
            <span className="text-[color:var(--mk-text)]">advertising around it?</span>
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
