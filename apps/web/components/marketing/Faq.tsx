import { Container, Eyebrow, Section } from "./primitives";

const FAQ = [
  {
    q: "What is DevAds?",
    a: "DevAds is infrastructure that lets companies sponsor developers and lets developers receive useful rewards while they build.",
  },
  {
    q: "Is DevAds just advertising?",
    a: "No. The first use case is sponsored cards shown in VS Code during builds and tests a developer is already waiting on. The larger system is sponsorship: an organization funds something of real value for the developer and pays for a verified outcome rather than a view.",
  },
  {
    q: "Are AI credits the only reward?",
    a: "No. AI credits are one reward type among several. The reward ledger also supports API, compute and tool credits, subscription credits, discounts and cash, and each campaign chooses its own.",
  },
  {
    q: "Who can sponsor developers?",
    a: "Potentially any legitimate organization that wants to reach developers, whether or not it sells developer tools.",
  },
  {
    q: "What can developers receive?",
    a: "AI credits, cloud credits, API credits, discounts, subscriptions, event access and other rewards.",
  },
  {
    q: "Does DevAds read my code?",
    a: "No. The intended architecture does not require source code, prompts, model responses, secrets or credentials. Sponsorship requests carry coarse, allowlisted metadata about the interaction only.",
  },
  {
    q: "Does DevAds need an AI provider partnership?",
    a: "No. The core sponsorship infrastructure is designed to work independently of any particular AI provider.",
  },
  {
    q: "Which tools will DevAds support?",
    a: "DevAds is designed to support different developer clients through adapters and the DevAds protocol. The VS Code extension is the first client; other adapters do not exist yet.",
  },
];

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <Eyebrow index="14">FAQ</Eyebrow>
            <h2 id="faq-title" className="mk-h2 mt-6">
              Questions, answered plainly.
            </h2>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-t border-white/[0.07] last:border-b">
                <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-[17px] tracking-[-0.015em] transition-colors hover:text-white sm:text-[18px]">
                  {item.q}
                  <span className="mk-faq-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[color:var(--mk-muted)] transition-transform duration-300">
                    <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="max-w-xl pb-6 pr-10 text-[15px] leading-relaxed text-[color:var(--mk-muted)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
