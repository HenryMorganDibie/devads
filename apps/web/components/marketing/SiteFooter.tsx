import Link from "next/link";
import { LINKS } from "../../lib/site";
import { Container, Logo } from "./primitives";

type Item = { label: string; href?: string };

const COLUMNS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Product",
    items: [
      { label: "Developers", href: "#developers" },
      { label: "Sponsors", href: "#sponsors" },
      { label: "Platforms", href: "#platforms" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Docs", href: LINKS.docs },
      { label: "Protocol", href: "#protocol" },
      { label: "GitHub", href: LINKS.github },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "About", href: "#thesis" },
      { label: "Contact", href: LINKS.contact },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy", href: LINKS.privacy ?? "#privacy" },
      { label: "Terms", href: LINKS.terms },
    ],
  },
];

function FooterLink({ item }: { item: Item }) {
  const cls = "text-[14px] text-[color:var(--mk-muted)] transition-colors hover:text-white";
  if (!item.href) {
    return (
      <span className="flex items-center gap-2 text-[14px] text-[color:var(--mk-dim)]">
        {item.label}
        <span className="rounded-full border border-white/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em]">Soon</span>
      </span>
    );
  }
  if (item.href.startsWith("#")) return <a href={item.href} className={cls}>{item.label}</a>;
  if (item.href.startsWith("/")) return <Link href={item.href} className={cls}>{item.label}</Link>;
  return (
    <a href={item.href} className={cls} target="_blank" rel="noreferrer">
      {item.label}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] pb-10 pt-16 sm:pt-20">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[color:var(--mk-muted)]">
              The sponsorship infrastructure for AI-powered development.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:col-span-8">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="mk-eyebrow">{col.title}</p>
                <ul className="mt-5 space-y-3">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <FooterLink item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-[12px] text-[color:var(--mk-dim)] sm:flex-row sm:items-center sm:justify-between">
          <span>DevAds is an early product. Product previews on this page are conceptual.</span>
          <a href="#top" className="font-mono uppercase tracking-[0.12em] transition-colors hover:text-white">
            Back to top &uarr;
          </a>
        </div>
      </Container>
    </footer>
  );
}
