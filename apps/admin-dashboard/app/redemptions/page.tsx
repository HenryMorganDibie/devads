"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminId, loadAdminId } from "../../lib/api";
import type { AdminActionResult } from "../../lib/sponsorships";
import {
  completeRedemption,
  failRedemption,
  fetchAdminRedemptions,
  validateFailReason,
  validateFulfilmentRef,
  type RedemptionStatus,
} from "../../lib/redemptions";
import { AdminRedemptionsView, type AdminRedemptionsState } from "../../components/AdminRedemptionsView";

export default function AdminRedemptionsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<RedemptionStatus | null>("PENDING");
  const [state, setState] = useState<AdminRedemptionsState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!loadAdminId()) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    fetchAdminRedemptions(filter).then(setState);
  }, [router, filter]);

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

  function complete(id: string) {
    const input = window.prompt("Mark this redemption delivered. Optional internal fulfilment reference (never the reward code itself):", "");
    if (input === null) return;
    const checked = validateFulfilmentRef(input);
    if (!checked.ok) {
      setActionError(checked.message);
      return;
    }
    run(id, () => completeRedemption(id, checked.ref));
  }

  function fail(id: string) {
    const input = window.prompt("Fail this redemption and return the units to the developer. Reason (stored on the redemption; the developer can see it):");
    if (input === null) return;
    const checked = validateFailReason(input);
    if (!checked.ok) {
      setActionError(checked.message);
      return;
    }
    run(id, () => failRedemption(id, checked.reason));
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <div className="flex gap-6">
          <h1 className="text-2xl font-semibold">Redemptions</h1>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/campaigns" className="hover:text-white">Campaigns</Link>
            <Link href="/sponsorships" className="hover:text-white">Sponsorships</Link>
            <Link href="/redemptions" className="text-white">Redemptions</Link>
            <Link href="/advertisers" className="hover:text-white">Advertisers</Link>
            <Link href="/overview" className="hover:text-white">Overview</Link>
          </nav>
        </div>
        <button onClick={signOut} className="text-sm text-muted hover:text-white">Sign out</button>
      </div>
      <p className="text-sm text-muted mb-8 max-w-2xl">
        Developers redeem Developer Rewards from their wallet. Redemptions the provider leaves open (all of them,
        with the manual provider) wait here: deliver the reward out of band and mark it delivered, or fail it, which
        returns the units to the developer&apos;s balance.
      </p>
      <AdminRedemptionsView
        state={state}
        filter={filter}
        onFilter={setFilter}
        onRetry={load}
        actionError={actionError}
        busyId={busyId}
        onComplete={complete}
        onFail={fail}
      />
    </main>
  );
}
