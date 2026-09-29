"use client";

import { useCallback, useEffect, useState } from "react";
import { useDeveloper } from "../../../components/AppShell";
import { RewardWalletView, type WalletPageState } from "../../../components/RewardWalletView";
import { fetchRewardWallet } from "../../../lib/rewards";

export default function BetaWalletPage() {
  const { me } = useDeveloper();
  const [state, setState] = useState<WalletPageState>({ status: "loading" });

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchRewardWallet(me.developerId).then(setState);
  }, [me.developerId]);

  useEffect(() => load(), [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Wallet</h1>
      <p className="text-sm text-muted mb-8">
        Balances are computed on the server from an append-only ledger and cannot be changed from the browser. Beta
        Credits come from DevAds Beta Opportunities; they are not cash, cannot be redeemed, and are kept separate from
        sponsor rewards.
      </p>
      <RewardWalletView state={state} now={new Date()} onRetry={load} />
    </div>
  );
}
