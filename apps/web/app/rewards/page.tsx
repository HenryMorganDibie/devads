"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "../../lib/api";
import { fetchRewardWallet } from "../../lib/rewards";
import { DeveloperNav } from "../../components/DeveloperNav";
import { RewardWalletView, type WalletPageState } from "../../components/RewardWalletView";

export default function RewardsPage() {
  const router = useRouter();
  const [state, setState] = useState<WalletPageState>({ status: "loading" });

  const load = useCallback(() => {
    const session = loadSession();
    if (!session || !session.developerId) {
      router.push("/login");
      return;
    }
    setState({ status: "loading" });
    fetchRewardWallet(session.developerId).then(setState);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Developer Rewards</h1>
      <DeveloperNav current="rewards" />
      <RewardWalletView state={state} now={new Date()} onRetry={load} />
    </main>
  );
}
