"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "../../lib/api";
import { fetchActiveSponsorships, fetchSponsorshipStatus } from "../../lib/sponsorships";
import { DeveloperNav } from "../../components/DeveloperNav";
import {
  SponsorshipsView,
  type ActiveSponsorshipsState,
  type SponsorshipsPageState,
} from "../../components/SponsorshipsView";

export default function SponsorshipsPage() {
  const router = useRouter();
  const [state, setState] = useState<SponsorshipsPageState>({ status: "loading" });
  const [offers, setOffers] = useState<ActiveSponsorshipsState>({ status: "loading" });

  const load = useCallback(() => {
    const session = loadSession();
    if (!session || !session.developerId) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    setOffers({ status: "loading" });
    // Independent requests: one failing doesn't hide the other's result.
    fetchSponsorshipStatus(session.developerId).then(setState);
    fetchActiveSponsorships().then(setOffers);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Sponsorships</h1>
      <DeveloperNav current="sponsorships" />
      <SponsorshipsView state={state} offers={offers} onRetry={load} />
    </main>
  );
}
