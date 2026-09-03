"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, clearSession, formatCents, loadSession } from "../../lib/api";

interface Earnings {
  currency: string;
  today: number;
  thisWeek: number;
  thisMonth: number;
  lifetime: number;
  impressions: number;
  clicks: number;
  availableBalanceCents: number;
  payoutThresholdCents: number;
  payouts: Array<{ id: string; amountCents: number; currency: string; status: string; requestedAt: string }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [adsEnabled, setAdsEnabled] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);

  async function requestPayout() {
    const session = loadSession();
    if (!session?.developerId) return;
    setPayoutLoading(true);
    setPayoutMessage(null);
    const { ok, data } = await apiPost<{ status: string; error?: string }>("/api/v1/earnings/payout", {
      developerId: session.developerId,
    });
    setPayoutLoading(false);
    if (!ok) {
      setPayoutMessage(data.error === "below_payout_threshold" ? "Below the minimum payout threshold." : "Payout request failed.");
      return;
    }
    setPayoutMessage(`Payout ${data.status.toLowerCase()}.`);
    apiGet<Earnings>(`/api/v1/earnings?developerId=${session.developerId}`).then(({ ok, data }) => {
      if (ok) setEarnings(data);
    });
  }

  useEffect(() => {
    const session = loadSession();
    if (!session || !session.developerId) {
      router.push("/login");
      return;
    }
    apiGet<Earnings>(`/api/v1/earnings?developerId=${session.developerId}`).then(({ ok, data }) => {
      if (ok) setEarnings(data);
      setLoading(false);
    });
    apiGet<{ adsEnabled: boolean }>(`/api/v1/developers/${session.developerId}/preferences`).then(({ ok, data }) => {
      if (ok) setAdsEnabled(data.adsEnabled);
    });
  }, [router]);

  function signOut() {
    clearSession();
    router.push("/");
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-16">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-2xl font-semibold">Your DevAds dashboard</h1>
        <button onClick={signOut} className="text-sm text-muted hover:text-white">
          Sign out
        </button>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Today" value={formatCents(earnings?.today ?? 0, earnings?.currency)} />
        <Stat label="This week" value={formatCents(earnings?.thisWeek ?? 0, earnings?.currency)} />
        <Stat label="This month" value={formatCents(earnings?.thisMonth ?? 0, earnings?.currency)} />
        <Stat label="Lifetime" value={formatCents(earnings?.lifetime ?? 0, earnings?.currency)} />
      </section>

      <p className="text-xs text-muted mb-4">
        Earnings reflect qualified ad views only and are not guaranteed. Balances become payable once
        they reach the minimum payout threshold ({formatCents(earnings?.payoutThresholdCents ?? 0)}).
      </p>

      {earnings && (
        <div className="mb-10 flex items-center gap-3">
          <button
            className="btn-primary text-sm"
            disabled={
              payoutLoading || earnings.availableBalanceCents < earnings.payoutThresholdCents
            }
            onClick={requestPayout}
          >
            {payoutLoading
              ? "Requesting..."
              : `Withdraw ${formatCents(earnings.availableBalanceCents, earnings.currency)}`}
          </button>
          {payoutMessage && <span className="text-xs text-muted">{payoutMessage}</span>}
        </div>
      )}

      <section className="card p-6 mb-10">
        <h2 className="font-medium mb-4">Activity</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted">Impressions</span>
            <p className="text-lg">{earnings?.impressions ?? 0}</p>
          </div>
          <div>
            <span className="text-muted">Clicks</span>
            <p className="text-lg">{earnings?.clicks ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="card p-6 mb-10">
        <h2 className="font-medium mb-4">Payouts</h2>
        {earnings && earnings.payouts.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="font-normal pb-2">Date</th>
                <th className="font-normal pb-2">Amount</th>
                <th className="font-normal pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {earnings.payouts.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="py-2">{new Date(p.requestedAt).toLocaleDateString()}</td>
                  <td className="py-2">{formatCents(p.amountCents, p.currency)}</td>
                  <td className="py-2">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No payouts yet.</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-medium mb-4">Preferences</h2>
        <label className="flex items-center gap-3 text-sm mb-3">
          <input
            type="checkbox"
            checked={adsEnabled}
            disabled={savingPrefs}
            onChange={async (e) => {
              const next = e.target.checked;
              setAdsEnabled(next);
              setSavingPrefs(true);
              const session = loadSession();
              if (session?.developerId) {
                await apiPatch(`/api/v1/developers/${session.developerId}/preferences`, { adsEnabled: next });
              }
              setSavingPrefs(false);
            }}
            className="h-4 w-4"
          />
          Enable DevAds in VS Code
        </label>
        <p className="text-xs text-muted">
          Fine-grained settings (minimum wait seconds, categories, video ads, frequency cap) live in
          the VS Code extension settings &mdash; search &quot;DevAds&quot; in your editor settings.
        </p>
      </section>
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
