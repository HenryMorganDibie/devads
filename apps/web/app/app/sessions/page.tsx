"use client";

import { useEffect, useState } from "react";
import {
  fetchHistory,
  fetchSessions,
  type DevelopmentSessionListResponse,
  type SponsorshipHistoryResponse,
} from "../../../lib/beta";
import { formatUnits, rewardTypeLabel } from "../../../lib/rewards";

const EVENT_LABELS: Record<string, string> = {
  OFFER_DISPLAYED: "Shown",
  OFFER_OPENED: "Opened",
  OFFER_INTERACTED: "Interacted",
  OFFER_SKIPPED: "Skipped",
  OFFER_COMPLETED: "Completed",
};

const CLIENT_LABELS: Record<string, string> = { WEB: "DevAds web", VS_CODE: "VS Code" };

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<DevelopmentSessionListResponse | null | "error">(null);
  const [history, setHistory] = useState<SponsorshipHistoryResponse | null | "error">(null);

  useEffect(() => {
    fetchSessions().then((r) => setSessions(r ?? "error")).catch(() => setSessions("error"));
    fetchHistory().then((r) => setHistory(r ?? "error")).catch(() => setHistory("error"));
  }, []);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold mb-2">Sessions</h1>
        <p className="text-sm text-muted mb-6">
          A session is a period of use in one DevAds client. Only coarse metadata is kept: the client, when it started
          and ended, and how many sponsorship events happened in it.
        </p>
        {sessions === null ? (
          <p className="text-muted">Loading...</p>
        ) : sessions === "error" ? (
          <p className="text-muted">We could not load your sessions.</p>
        ) : sessions.sessions.length === 0 ? (
          <p className="text-muted">No sessions yet. One starts when you look for a beta opportunity or use the extension.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="p-3 font-normal">Client</th>
                  <th className="p-3 font-normal">Started</th>
                  <th className="p-3 font-normal">Status</th>
                  <th className="p-3 font-normal text-right">Interactions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.sessions.map((s) => (
                  <tr key={s.id} className="border-t border-white/[0.06]">
                    <td className="p-3">{CLIENT_LABELS[s.clientType] ?? s.clientType}</td>
                    <td className="p-3 whitespace-nowrap">{when(s.startedAt)}</td>
                    <td className="p-3">{s.status === "ACTIVE" ? "Active" : "Ended"}</td>
                    <td className="p-3 text-right font-mono">{s.interactions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Sponsorship history</h2>
        {history === null ? (
          <p className="text-muted">Loading...</p>
        ) : history === "error" ? (
          <p className="text-muted">We could not load your history.</p>
        ) : history.events.length === 0 ? (
          <p className="text-muted">No sponsorship activity yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="p-3 font-normal">Opportunity</th>
                  <th className="p-3 font-normal">Event</th>
                  <th className="p-3 font-normal">Campaign reward</th>
                  <th className="p-3 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {history.events.map((e) => (
                  <tr key={e.eventId} className="border-t border-white/[0.06]">
                    <td className="p-3">
                      {e.campaignMode === "BETA" && (
                        <span className="text-[10px] font-mono uppercase text-accent mr-2">Beta</span>
                      )}
                      {e.offerTitle}
                    </td>
                    <td className="p-3">{EVENT_LABELS[e.type] ?? e.type}</td>
                    <td className="p-3 whitespace-nowrap">
                      {e.type === "OFFER_COMPLETED" ? `${formatUnits(e.rewardAmountUnits)} ${rewardTypeLabel(e.rewardType)}` : "-"}
                    </td>
                    <td className="p-3 whitespace-nowrap">{when(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
