"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearSession, loadSession } from "../../lib/api";
import { fetchSponsorshipCampaigns, submitSponsorshipCampaign } from "../../lib/sponsorships";
import { AdvertiserNav } from "../../components/AdvertiserNav";
import { SponsorshipCampaignsView, type CampaignListState } from "../../components/SponsorshipCampaignsView";

export default function SponsorshipsPage() {
  const router = useRouter();
  const [state, setState] = useState<CampaignListState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    const session = loadSession();
    if (!session || !session.advertiserId) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    fetchSponsorshipCampaigns(session.advertiserId).then(setState);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(id: string) {
    setBusyId(id);
    setActionError(null);
    const result = await submitSponsorshipCampaign(id);
    if (result.status === "unauthenticated") setState({ status: "unauthenticated" });
    else if (result.status === "error") setActionError(result.message);
    else load();
    setBusyId(null);
  }

  function signOut() {
    clearSession();
    router.push("/login");
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sponsorships</h1>
        <div className="flex gap-3">
          <Link href="/sponsorships/new" className="btn-primary text-sm">
            New sponsorship
          </Link>
          <button onClick={signOut} className="text-sm text-muted hover:text-white">
            Sign out
          </button>
        </div>
      </div>
      <AdvertiserNav current="sponsorships" />
      <SponsorshipCampaignsView
        state={state}
        onRetry={load}
        onSubmitCampaign={submit}
        busyId={busyId}
        actionError={actionError}
      />
    </main>
  );
}
