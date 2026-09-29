import type { Metadata } from "next";
import Link from "next/link";
import { BetaTerms } from "../../../components/BetaTerms";

export const metadata: Metadata = { title: "Developer Beta Terms | DevAds" };

export default function BetaTermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <h1 className="text-2xl font-semibold mb-6">DevAds Developer Beta terms</h1>
      <BetaTerms />
      <Link href="/join" className="btn-primary inline-block mt-10">
        Join the Developer Beta
      </Link>
    </main>
  );
}
