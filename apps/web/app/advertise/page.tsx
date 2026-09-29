import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Container, Logo } from "../../components/marketing/primitives";

export const metadata: Metadata = {
  title: "Sponsor developers | DevAds",
  description:
    "Fund campaigns that pay for verified developer engagement and reward the developers who engage, instead of buying anonymous impressions.",
};

const HOW = [
  "Set a budget, the outcome you want to support and the reward a developer receives.",
  "Target by client, category and caps. Campaigns are reviewed before they serve.",
  "You are charged per verified completion at the price you set, never beyond your budget.",
  "Reporting shows displays, completions, rewards granted and spend.",
];

const FORMATS = [
  {
    name: "Sponsored opportunities",
    body: "An offer with a real reward, such as AI, API or cloud credits, a discount or event access. Charged per verified completion.",
  },
  {
    name: "Wait-time sponsored cards",
    body: "The first format: a compact card in VS Code during builds, installs and tests a developer is already waiting on. CPM-priced.",
  },
];

export default function AdvertisePage() {
  const advertiserAppUrl = process.env.NEXT_PUBLIC_ADVERTISER_APP_URL ?? "http://localhost:3001";

  return (
    <div className="mk min-h-screen">
      <Container className="py-8">
        <Link href="/" aria-label="DevAds home" className="inline-flex h-11 items-center rounded-md">
          <Logo />
        </Link>
      </Container>
      <main>
        <Container className="pb-24 pt-10 sm:pt-16">
          <p className="mk-eyebrow">For sponsors</p>
          <h1 className="mk-h2 mt-6 max-w-4xl">
            Turn your developer marketing budget into <span className="text-fund">developer value.</span>
          </h1>
          <p className="mk-lede mt-7 max-w-2xl">
            Fund campaigns that pay for verified, qualified developer engagement, and reward the developers who engage,
            instead of buying anonymous impressions. Any legitimate organization can sponsor developers.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a href={advertiserAppUrl} className="mk-btn mk-btn-primary">
              Create a sponsor account <ArrowRight />
            </a>
            <Link href="/#how-it-works" className="mk-btn mk-btn-ghost">
              See how it works
            </Link>
          </div>

          <div className="mt-20 grid gap-12 border-t border-white/[0.06] pt-12 lg:grid-cols-2">
            <section aria-labelledby="how-title">
              <h2 id="how-title" className="mk-eyebrow">
                How a campaign works
              </h2>
              <ol className="mt-6 space-y-4">
                {HOW.map((item, i) => (
                  <li key={item} className="flex gap-4 text-[15px] leading-relaxed">
                    <span className="font-mono text-[11px] leading-[1.9rem] text-[color:var(--mk-dim)]">0{i + 1}</span>
                    <span className="text-[color:var(--mk-text)]/90">{item}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="formats-title">
              <h2 id="formats-title" className="mk-eyebrow">
                Formats
              </h2>
              <ul className="mt-6 space-y-3">
                {FORMATS.map((f) => (
                  <li key={f.name} className="rounded-xl border border-white/[0.08] bg-[#0c0d10] p-5">
                    <p className="flex items-center gap-2 text-[15px] tracking-[-0.01em]">
                      <Check className="text-fund" />
                      {f.name}
                    </p>
                    <p className="mt-1.5 pl-[22px] text-[13.5px] leading-relaxed text-[color:var(--mk-muted)]">{f.body}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[13px] leading-relaxed text-[color:var(--mk-dim)]">
                Developers opt in, choose what to engage with and never share source code, prompts, model responses or
                secrets.
              </p>
            </section>
          </div>
        </Container>
      </main>
    </div>
  );
}
