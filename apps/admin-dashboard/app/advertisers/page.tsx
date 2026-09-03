"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, loadAdminId } from "../../lib/api";

interface Campaign {
  advertiser: { id: string; name: string; status: string };
}

interface AdvertiserRow {
  id: string;
  name: string;
  status: string;
}

export default function AdvertisersPage() {
  const router = useRouter();
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const { ok, data } = await apiGet<Campaign[]>("/api/v1/admin/campaigns");
    if (!ok) return;
    const map = new Map<string, AdvertiserRow>();
    for (const c of data) map.set(c.advertiser.id, c.advertiser);
    setAdvertisers(Array.from(map.values()));
  }

  useEffect(() => {
    if (!loadAdminId()) {
      router.push("/login");
      return;
    }
    refresh();
  }, [router]);

  async function suspend(id: string) {
    if (!window.confirm("Suspend this advertiser? All of their campaigns will stop serving.")) return;
    setBusyId(id);
    await apiPost(`/api/v1/admin/advertisers/${id}/suspend`, {});
    await refresh();
    setBusyId(null);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex gap-6 mb-10">
        <h1 className="text-2xl font-semibold">Advertisers</h1>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/campaigns" className="hover:text-white">Campaigns</Link>
          <Link href="/advertisers" className="text-white">Advertisers</Link>
          <Link href="/overview" className="hover:text-white">Overview</Link>
        </nav>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted text-left border-b border-white/5">
            <tr>
              <th className="font-normal p-3">Advertiser</th>
              <th className="font-normal p-3">Status</th>
              <th className="font-normal p-3"></th>
            </tr>
          </thead>
          <tbody>
            {advertisers.map((a) => (
              <tr key={a.id} className="border-b border-white/5 last:border-0">
                <td className="p-3">{a.name}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3 text-right">
                  {a.status === "ACTIVE" && (
                    <button className="btn-danger" disabled={busyId === a.id} onClick={() => suspend(a.id)}>
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
