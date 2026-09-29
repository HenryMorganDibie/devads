import type { RewardWallet } from "@devads/ad-sdk";
import { rewardLabel } from "./sponsoredOffer";
import { describeSponsorshipError, type SponsorshipApi } from "./sponsorshipClient";

/** One display row per reward type. */
export interface WalletLine {
  label: string;
  detail: string;
}

export type WalletLoadResult =
  | { ok: true; lines: WalletLine[] }
  | { ok: false; message: string };

/** Pure: turns the SDK's wallet into display rows (available + pending per reward type). */
export function formatWallet(wallet: RewardWallet): WalletLine[] {
  return wallet.balances.map((b) => ({
    label: rewardLabel(b.rewardType),
    detail: `${b.availableUnits} units available, ${b.pendingUnits} pending`,
  }));
}

/**
 * Loads the signed-in developer's reward wallet via the SDK's getWallet()
 * (developer id comes from the existing device-auth state). Never throws.
 */
export async function loadWallet(client: SponsorshipApi | null, isSignedIn: boolean): Promise<WalletLoadResult> {
  if (!isSignedIn) return { ok: false, message: "DevAds: sign in to see your reward wallet." };
  if (!client) return { ok: false, message: "DevAds: the reward wallet is unavailable right now." };
  try {
    const wallet = await client.getWallet();
    return { ok: true, lines: formatWallet(wallet) };
  } catch (err) {
    return {
      ok: false,
      message: `DevAds: couldn't load your reward wallet (${describeSponsorshipError(err)}).`,
    };
  }
}
