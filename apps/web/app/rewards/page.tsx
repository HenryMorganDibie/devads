"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "../../lib/api";
import { fetchRewardWallet } from "../../lib/rewards";
import { fetchRedemptions, requestRedemption } from "../../lib/redemptions";
import { DeveloperNav } from "../../components/DeveloperNav";
import { RewardWalletView, type WalletPageState } from "../../components/RewardWalletView";
import { RedemptionPanel, type RedemptionsPanelState } from "../../components/RedemptionPanel";

export default function RewardsPage() {
  const router = useRouter();
  const [state, setState] = useState<WalletPageState>({ status: "loading" });
  const [redemptions, setRedemptions] = useState<RedemptionsPanelState>({ status: "loading" });
  const [developerId, setDeveloperId] = useState<string | null>(null);

  const load = useCallback(() => {
    const session = loadSession();
    if (!session || !session.developerId) {
      router.push("/login");
      return;
    }
    setDeveloperId(session.developerId);
    setState({ status: "loading" });
    setRedemptions({ status: "loading" });
    fetchRewardWallet(session.developerId).then(setState);
    fetchRedemptions(session.developerId).then(setRedemptions);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // After a redemption: refresh in place, so the panel (and its outcome message) stays mounted.
  const refresh = useCallback(() => {
    if (!developerId) return;
    fetchRewardWallet(developerId).then(setState);
    fetchRedemptions(developerId).then(setRedemptions);
  }, [developerId]);

  const redemptionEnabled = redemptions.status === "ok" && redemptions.data.redemptionEnabled;
  const balances =
    state.status === "ok"
      ? state.wallet.balances.map((b) => ({ rewardType: b.rewardType, availableUnits: b.availableUnits }))
      : [];

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Developer Rewards</h1>
      <DeveloperNav current="rewards" />
      <RewardWalletView state={state} now={new Date()} onRetry={load} redemptionEnabled={redemptionEnabled}>
        {developerId && (
          <RedemptionPanel
            state={redemptions}
            balances={balances}
            onRedeem={(rewardType, amountUnits, idempotencyKey) =>
              requestRedemption({ developerId, rewardType, amountUnits, idempotencyKey })
            }
            onRedeemed={refresh}
          />
        )}
      </RewardWalletView>
    </main>
  );
}
