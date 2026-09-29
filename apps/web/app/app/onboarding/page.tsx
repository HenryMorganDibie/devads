"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeveloper } from "../../../components/AppShell";
import { BetaTerms } from "../../../components/BetaTerms";
import { BETA_TERMS_VERSION, joinBeta, setSponsorshipsEnabled } from "../../../lib/beta";

export default function OnboardingPage() {
  const router = useRouter();
  const { me, refresh } = useDeveloper();
  const [accepted, setAccepted] = useState(false);
  const [optIn, setOptIn] = useState(me.sponsorshipsEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) return;
    setSaving(true);
    setError(null);
    const joined = await joinBeta(BETA_TERMS_VERSION).catch(() => null);
    const prefOk = joined && optIn !== joined.sponsorshipsEnabled
      ? await setSponsorshipsEnabled(joined.developerId, optIn).catch(() => false)
      : true;
    if (!joined || !prefOk) {
      setSaving(false);
      setError("We couldn't save that. Please try again.");
      return;
    }
    await refresh();
    router.replace("/app");
  }

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-mono uppercase tracking-[0.14em] text-accent mb-3">Welcome{me.displayName ? `, ${me.displayName}` : ""}</p>
      <h1 className="text-2xl font-semibold mb-3">Join the DevAds Developer Beta</h1>
      <p className="text-sm text-muted mb-8">
        Signed in as <span className="text-white">{me.email}</span>. Two quick choices and you are in.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="card p-5">
          <h2 className="font-medium mb-3">1. Beta terms</h2>
          <BetaTerms />
          <label className="flex items-start gap-3 mt-5 text-sm">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
            <span>I have read and accept the DevAds Developer Beta terms.</span>
          </label>
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-2">2. Sponsorships</h2>
          <p className="text-sm text-muted mb-4">
            Opting in lets DevAds show you clearly labelled opportunities. During the beta these are DevAds Beta
            Opportunities only. You can change this at any time from your dashboard.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Opt me in to sponsorship opportunities.</span>
          </label>
        </section>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={!accepted || saving}>
          {saving ? "Joining..." : "Join the beta and continue"}
        </button>
      </form>
    </div>
  );
}
