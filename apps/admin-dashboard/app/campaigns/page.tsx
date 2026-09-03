"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, clearAdminId, formatCents, loadAdminId } from "../../lib/api";

interface Campaign {
  id: string;
  name: string;
  status: string;
  cpmCents: number;
  currency: string;
  isDemo: boolean;
  rejectionReason: string | null;
  advertiser: { id: string; name: string; status: string };
  creatives: Array<{ id: string; headline: string; ctaUrl: string }>;
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const { ok, data } = await apiGet<Campaign[]>("/api/v1/admin/campaigns");
    if (ok) setCampaigns(data);
  }

  useEffect(() => {
    if (!loadAdminId()) {
      router.push("/login");
      return;
    }
    refresh();
  }, [router]);

  function signOut() {
    clearAdminId();
    router.push("/login");
  }

  async function approve(id: string) {
    setBusyId(id);
    await apiPost(`/api/v1/admin/campaigns/${id}/approve`, {});
    await refresh();
    setBusyId(null);
  }

  async function reject(id: string) {
    const reason = window.prompt("Rejection reason:");
    if (!reason) return;
    setBusyId(id);
    await apiPost(`/api/v1/admin/campaigns/${id}/reject`, { reason });
    await refresh();
    setBusyId(null);
  }

  async function pause(id: string) {
    setBusyId(id);
    await apiPost(`/api/v1/admin/campaigns/${id}/pause`, {});
    await refresh();
    setBusyId(null);
  }

  const queue = campaigns.filter((c) => c.status === "SUBMITTED");
  const others = campaigns.filter((c) => c.status !== "SUBMITTED");

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <div className="flex gap-6">
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/campaigns" className="text-white">Campaigns</Link>
            <Link href="/advertisers" className="hover:text-white">Advertisers</Link>
            <Link href="/overview" className="hover:text-white">Overview</Link>
          </nav>
        </div>
        <button onClick={signOut} className="text-sm text-muted hover:text-white">Sign out</button>
      </div>

      <section className="mb-10">
        <h2 className="font-medium mb-4">
          Pending review {queue.length > 0 && <span className="badge ml-1">{queue.length}</span>}
        </h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting on review.</p>
        ) : (
          <div className="space-y-3">
            {queue.map((c) => (
              <div key={c.id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {c.name} {c.isDemo && <span className="badge ml-2">DEMO</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {c.advertiser.name} &middot; {formatCents(c.cpmCents, c.currency)} CPM &middot;{" "}
                    {c.creatives[0]?.headline ?? "no creative"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" disabled={busyId === c.id} onClick={() => reject(c.id)}>
                    Reject
                  </button>
                  <button className="btn-primary text-sm" disabled={busyId === c.id} onClick={() => approve(c.id)}>
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-4">All campaigns</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-muted text-left border-b border-white/5">
              <tr>
                <th className="font-normal p-3">Campaign</th>
                <th className="font-normal p-3">Advertiser</th>
                <th className="font-normal p-3">Status</th>
                <th className="font-normal p-3">CPM</th>
                <th className="font-normal p-3"></th>
              </tr>
            </thead>
            <tbody>
              {others.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c.advertiser.name}</td>
                  <td className="p-3">{c.status}</td>
                  <td className="p-3">{formatCents(c.cpmCents, c.currency)}</td>
                  <td className="p-3 text-right">
                    {c.status === "APPROVED" && (
                      <button className="btn-secondary" disabled={busyId === c.id} onClick={() => pause(c.id)}>
                        Pause
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
