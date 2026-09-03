"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, formatCents, loadAdminId } from "../../lib/api";

interface Overview {
  developers: number;
  advertisers: number;
  activeCampaigns: number;
  impressions: number;
  totalSpendCents: number;
  totalDeveloperPayoutLiabilityCents: number;
  platformRevenueCents: number;
  pendingApprovals: number;
  openFraudFlags: number;
  developerRevenueShareBps: number;
}

export default function OverviewPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    if (!loadAdminId()) {
      router.push("/login");
      return;
    }
    apiGet<Overview>("/api/v1/admin/overview").then(({ ok, data }) => {
      if (ok) setOverview(data);
    });
  }, [router]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex gap-6 mb-10">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/campaigns" className="hover:text-white">Campaigns</Link>
          <Link href="/advertisers" className="hover:text-white">Advertisers</Link>
          <Link href="/overview" className="text-white">Overview</Link>
        </nav>
      </div>

      {overview && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat label="Developers" value={overview.developers.toLocaleString()} />
            <Stat label="Advertisers" value={overview.advertisers.toLocaleString()} />
            <Stat label="Active campaigns" value={overview.activeCampaigns.toLocaleString()} />
            <Stat label="Impressions" value={overview.impressions.toLocaleString()} />
          </section>
          <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Stat label="Advertiser spend" value={formatCents(overview.totalSpendCents)} />
            <Stat label="Developer payout liability" value={formatCents(overview.totalDeveloperPayoutLiabilityCents)} />
            <Stat label="Platform revenue" value={formatCents(overview.platformRevenueCents)} />
          </section>
          <section className="grid grid-cols-2 gap-4">
            <Stat label="Pending campaign approvals" value={overview.pendingApprovals.toLocaleString()} />
            <Stat label="Open fraud flags" value={overview.openFraudFlags.toLocaleString()} />
          </section>
          <p className="text-xs text-muted mt-8">
            Developer revenue share is currently {(overview.developerRevenueShareBps / 100).toFixed(0)}% of
            advertiser spend, configured via DEFAULT_DEVELOPER_REVENUE_SHARE_BPS.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
