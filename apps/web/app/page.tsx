import type { Metadata } from "next";
import { SITE } from "../lib/site";
import { SiteNav } from "../components/marketing/SiteNav";
import { Hero } from "../components/marketing/Hero";
import { Problem } from "../components/marketing/Problem";
import { NewModel } from "../components/marketing/NewModel";
import { EconomicLoop } from "../components/marketing/EconomicLoop";
import { Developers } from "../components/marketing/Developers";
import { Privacy } from "../components/marketing/Privacy";
import { Sponsors } from "../components/marketing/Sponsors";
import { Platforms } from "../components/marketing/Platforms";
import { Protocol } from "../components/marketing/Protocol";
import { Principles } from "../components/marketing/Principles";
import { Crescendo } from "../components/marketing/Crescendo";
import { Example } from "../components/marketing/Example";
import { Infrastructure } from "../components/marketing/Infrastructure";
import { BusinessModel } from "../components/marketing/BusinessModel";
import { Faq } from "../components/marketing/Faq";
import { FinalCta } from "../components/marketing/FinalCta";
import { SiteFooter } from "../components/marketing/SiteFooter";
import { RevealObserver } from "../components/marketing/RevealObserver";

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  ...(SITE.url ? { alternates: { canonical: "/" } } : {}),
};

export default function LandingPage() {
  return (
    <div className="mk relative">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-bone focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">
        <Hero />
        <Problem />
        <NewModel />
        <EconomicLoop />
        <Developers />
        <Privacy />
        <Sponsors />
        <Platforms />
        <Protocol />
        <Principles />
        <Crescendo />
        <Example />
        <Infrastructure />
        <BusinessModel />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
