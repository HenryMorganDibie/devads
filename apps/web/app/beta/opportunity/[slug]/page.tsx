import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OpportunityFlow } from "../../../../components/OpportunityFlow";
import { BETA_PRODUCTS, betaProduct } from "../../../../lib/betaProducts";

export function generateStaticParams() {
  return BETA_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = betaProduct(params.slug);
  return { title: p ? `${p.name} | DevAds Beta Opportunity` : "DevAds Beta Opportunity", robots: { index: false } };
}

/**
 * The product page a first-party beta video offer links to. Spending the
 * required time here and confirming is the campaign's qualifying action;
 * watching the video is not.
 */
export default function BetaProductOpportunityPage({ params }: { params: { slug: string } }) {
  const product = betaProduct(params.slug);
  if (!product) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] rounded border border-accent/40 text-accent px-1.5 py-0.5">
        DevAds Beta Opportunity · First-party
      </span>
      <h1 className="text-3xl font-semibold mt-4">{product.name}</h1>
      <p className="text-lg mt-2">{product.tagline}</p>
      <p className="text-sm text-muted mt-3">
        A DevAds-owned project, shown as part of the DevAds developer beta. Created and funded by DevAds; no external
        sponsor is involved.
      </p>

      <Suspense>
        <OpportunityFlow>
          <video
            className="w-full rounded-lg border border-white/10 bg-black mt-8"
            poster={`/beta-creatives/${product.slug}-20s.jpg`}
            controls
            muted
            playsInline
            preload="metadata"
          >
            <source src={`/beta-creatives/${product.slug}-20s.webm`} type="video/webm" />
            <source src={`/beta-creatives/${product.slug}-20s.mp4`} type="video/mp4" />
          </video>
          <section className="card p-5 mt-6">
            <h2 className="font-medium mb-2">What it is</h2>
            <p className="text-sm text-muted leading-relaxed">{product.what}</p>
          </section>
          <section className="card p-5 mt-4">
            <h2 className="font-medium mb-3">Why a developer might care</h2>
            <ul className="text-sm text-muted space-y-2 list-disc pl-5">
              {product.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            {product.tryIt && <p className="font-mono text-xs mt-4 break-all">$ {product.tryIt}</p>}
          </section>
          <p className="mt-6 mb-10">
            <a href={product.repoUrl} target="_blank" rel="noopener noreferrer" className="text-accent text-sm">
              View {product.name} on GitHub →
            </a>
          </p>
        </OpportunityFlow>
      </Suspense>
    </main>
  );
}
