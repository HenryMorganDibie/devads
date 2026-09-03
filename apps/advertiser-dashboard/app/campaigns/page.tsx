"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, clearSession, formatCents, loadSession } from "../../lib/api";

interface Campaign {
  id: string;
  name: string;
  status: string;
  cpmCents: number;
  currency: string;
  isDemo: boolean;
  stats: { impressions: number; clicks: number; ctr: number; spendCents: number };
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-muted",
  SUBMITTED: "text-yellow-400",
  APPROVED: "text-green-400",
  REJECTED: "text-red-400",
  PAUSED: "text-orange-400",
  ARCHIVED: "text-muted",
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session) {
      router.push("/login");
      return;
    }
    apiGet<Campaign[]>(`/api/v1/campaigns?advertiserId=${session.advertiserId}`).then(({ ok, data }) => {
      if (ok) setCampaigns(data);
    });
  }, [router]);

  function signOut() {
    clearSession();
    router.push("/login");
  }

  const totals = (campaigns ?? []).reduce(
    (acc, c) => ({
      spendCents: acc.spendCents + c.stats.spendCents,
      impressions: acc.impressions + c.stats.impressions,
      clicks: acc.clicks + c.stats.clicks,
    }),
    { spendCents: 0, impressions: 0, clicks: 0 }
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <div className="flex gap-3">
          <Link href="/campaigns/new" className="btn-primary text-sm">
            New campaign
          </Link>
          <button onClick={signOut} className="text-sm text-muted hover:text-white">
            Sign out
          </button>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-4 mb-10">
        <Stat label="Total spend" value={formatCents(totals.spendCents)} />
        <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
      </section>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted text-left border-b border-white/5">
            <tr>
              <th className="font-normal p-4">Campaign</th>
              <th className="font-normal p-4">Status</th>
              <th className="font-normal p-4">CPM</th>
              <th className="font-normal p-4">Impressions</th>
              <th className="font-normal p-4">CTR</th>
              <th className="font-normal p-4">Spend</th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).map((c) => (
              <tr key={c.id} className="border-b border-white/5 last:border-0">
                <td className="p-4">
                  {c.name} {c.isDemo && <span className="badge ml-2">DEMO</span>}
                </td>
                <td className={`p-4 ${STATUS_COLOR[c.status] ?? ""}`}>{c.status}</td>
                <td className="p-4">{formatCents(c.cpmCents, c.currency)}</td>
                <td className="p-4">{c.stats.impressions}</td>
                <td className="p-4">{(c.stats.ctr * 100).toFixed(1)}%</td>
                <td className="p-4">{formatCents(c.stats.spendCents)}</td>
              </tr>
            ))}
            {campaigns && campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No campaigns yet.{" "}
                  <Link href="/campaigns/new" className="text-accent">
                    Create your first one
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
