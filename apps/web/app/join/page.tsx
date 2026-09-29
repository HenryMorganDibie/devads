"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSession } from "../../lib/api";
import { OAuthButtons } from "../../components/OAuthButtons";

export default function JoinPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(Boolean(loadSession())), []);

  return (
    <main className="max-w-md mx-auto px-6 py-10">
      <Link href="/" className="inline-block font-semibold mb-12">
        DevAds
      </Link>
      <p className="text-xs font-mono uppercase tracking-[0.14em] text-accent mb-3">Developer beta</p>
      <h1 className="text-3xl font-semibold mb-4">Join the DevAds Developer Beta</h1>
      <p className="text-sm text-muted mb-6">
        DevAds is in developer beta. There are no external sponsors yet: beta opportunities are run and funded by
        DevAds so you can try the full flow, from a labelled opportunity to a verified reward in your wallet.
      </p>
      <ul className="text-sm space-y-2 mb-8 text-muted">
        <li>Sign in with GitHub or Google. No password, no extra personal details.</li>
        <li>Sponsorships stay off until you opt in, and you can turn them off at any time.</li>
        <li>Beta Credits are a record of verified participation. They are not cash and cannot be redeemed.</li>
        <li>No source code, prompts, model responses or secrets are ever collected.</li>
      </ul>
      {signedIn ? (
        <Link href="/app" className="btn-primary inline-block">
          Continue to your dashboard
        </Link>
      ) : (
        <OAuthButtons next="/app/onboarding" />
      )}
      <p className="text-xs text-muted mt-8">
        Already have a DevAds account?{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>
        . Representing an organization?{" "}
        <Link href="/advertise" className="text-accent">
          Become a sponsor
        </Link>
        .
      </p>
    </main>
  );
}
