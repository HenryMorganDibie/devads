"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminId, loadAdminId } from "../../lib/api";
import {
  approveSponsorshipCampaign,
  fetchAdminSponsorshipCampaigns,
  pauseSponsorshipCampaign,
  rejectSponsorshipCampaign,
  validateRejectReason,
  type AdminActionResult,
} from "../../lib/sponsorships";
import { AdminSponsorshipsView, type AdminSponsorshipsState } from "../../components/AdminSponsorshipsView";

export default function AdminSponsorshipsPage() {
  const router = useRouter();
  const [state, setState] = useState<AdminSponsorshipsState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!loadAdminId()) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    fetchAdminSponsorshipCampaigns().then(setState);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function signOut() {
    clearAdminId();
    router.push("/login");
  }

  async function run(id: string, action: () => Promise<AdminActionResult>) {
    setBusyId(id);
    setActionError(null);
    const result = await action();
    setBusyId(null);
    if (result.status === "unauthenticated") setState({ status: "unauthenticated" });
    else if (result.status === "error") setActionError(result.message);
    if (result.status !== "unauthenticated") load();
  }

  function reject(id: string) {
    const input = window.prompt("Rejection reason (shown to the sponsor):");
    if (input === null) return;
    const checked = validateRejectReason(input);
    if (!checked.ok) {
      setActionError(checked.message);
      return;
    }
    run(id, () => rejectSponsorshipCampaign(id, checked.reason));
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <div className="flex gap-6">
          <h1 className="text-2xl font-semibold">Sponsorships</h1>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/campaigns" className="hover:text-white">Campaigns</Link>
            <Link href="/sponsorships" className="text-white">Sponsorships</Link>
            <Link href="/advertisers" className="hover:text-white">Advertisers</Link>
            <Link href="/overview" className="hover:text-white">Overview</Link>
          </nav>
        </div>
        <button onClick={signOut} className="text-sm text-muted hover:text-white">Sign out</button>
      </div>
      <p className="text-sm text-muted mb-8 max-w-2xl">
        Sponsorship campaigns fund Developer Rewards and are reviewed separately from Ad Campaigns.
        Approving one lets it serve sponsored offers from its start date.
      </p>
      <AdminSponsorshipsView
        state={state}
        onRetry={load}
        actionError={actionError}
        busyId={busyId}
        onApprove={(id) => run(id, () => approveSponsorshipCampaign(id))}
        onReject={reject}
        onPause={(id) => {
          if (window.confirm("Pause this sponsorship campaign? It stops serving offers. There is no resume action yet.")) {
            run(id, () => pauseSponsorshipCampaign(id));
          }
        }}
      />
    </main>
  );
}
