import { ArrowRight, Check, Container, Eyebrow, PreviewTag, Reveal, Section } from "./primitives";
import { CountUp } from "./CountUp";
import { LINKS } from "../../lib/site";
import Link from "next/link";

const REWARDS = [
  { name: "AI credits", detail: "For coding agents and model usage" },
  { name: "Cloud credits", detail: "Compute, hosting and storage" },
  { name: "API credits", detail: "For the services you build on" },
  { name: "SaaS discounts", detail: "On the tools already in your stack" },
  { name: "Event access", detail: "Conferences, workshops, meetups" },
  { name: "And more", detail: "Subscriptions, courses, connectivity" },
];

const WALLET = [
  { name: "AI Credits", amount: 25 },
  { name: "Cloud Credits", amount: 10 },
  { name: "API Credits", amount: 5 },
];

function Wallet() {
  const total = WALLET.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="mk-panel relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--mk-text)]">
          <span className="h-1.5 w-1.5 rounded-full bg-value" />
          DevAds wallet
        </span>
        <PreviewTag />
      </div>

      <div className="px-5 pb-2 pt-5">
        <p className="text-[12.5px] text-[color:var(--mk-muted)]">Available rewards</p>
        <ul className="mt-3 divide-y divide-white/[0.05]">
          {WALLET.map((r) => (
            <li key={r.name} className="flex items-center justify-between py-3.5">
              <span className="flex items-center gap-3 text-[14.5px]">
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] font-mono text-[10px] text-[color:var(--mk-muted)]">
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
                {r.name}
              </span>
              <span className="font-mono text-[14px] text-value">
                +<CountUp value={r.amount} decimals={2} prefix="$" />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-5 flex items-end justify-between border-t border-dashed border-white/[0.1] py-5">
        <span className="text-[13px] text-[color:var(--mk-muted)]">Total</span>
        <span className="font-display text-[34px] font-medium leading-none tracking-[-0.03em]">
          <CountUp value={total} decimals={2} prefix="$" />
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.015] px-5 py-3.5">
        <span className="text-[13px] text-[color:var(--mk-muted)]">Sponsored opportunities</span>
        <span className="flex items-center gap-2 text-[12.5px] text-[color:var(--mk-text)]">
          <span aria-hidden className="relative h-[18px] w-8 rounded-full bg-value/80">
            <span className="absolute right-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-[#08090a]" />
          </span>
          On
        </span>
      </div>
      <p className="px-5 pb-4 pt-1 text-[11.5px] leading-relaxed text-[color:var(--mk-dim)]">
        Sample balances for illustration. This is not a real account and holds no money.
      </p>
    </div>
  );
}

export function Developers() {
  return (
    <Section id="developers" labelledBy="developers-title">
      <Container>
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-6">
            <Eyebrow index="04">For developers</Eyebrow>
            <h2 id="developers-title" className="mk-h2 mt-6">
              Your AI coding costs money. <span className="text-value">Someone can help pay for it.</span>
            </h2>
            <p className="mk-lede mt-7 max-w-lg">
              Developers can opt into sponsored experiences and receive useful rewards while they build. You choose to
              participate, you choose what to engage with, and the reward lands in your wallet.
            </p>

            <ul className="mt-12 grid gap-px overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
              {REWARDS.map((r, i) => (
                <Reveal as="li" key={r.name} delay={i * 60} className="bg-[#0a0b0d] px-5 py-4 transition-colors hover:bg-[#0e0f12]">
                  <p className="flex items-center gap-2 text-[15px] tracking-[-0.01em]">
                    <Check className="text-value" />
                    {r.name}
                  </p>
                  <p className="mt-1 pl-[22px] text-[13px] text-[color:var(--mk-muted)]">{r.detail}</p>
                </Reveal>
              ))}
            </ul>

            <Link href={LINKS.signUp} className="mk-btn mk-btn-primary mt-10">
              Join as a developer <ArrowRight />
            </Link>
          </div>

          <Reveal className="lg:col-span-5 lg:col-start-8 lg:pt-16">
            <Wallet />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
