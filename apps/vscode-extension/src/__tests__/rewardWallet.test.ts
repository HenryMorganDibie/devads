import { describe, expect, it, vi } from "vitest";
import { DevAdsError } from "@devads/ad-sdk";
import { formatWallet, loadWallet } from "../rewardWallet";
import type { SponsorshipApi } from "../sponsorshipClient";

const WALLET = {
  developerId: "dev_1",
  balances: [
    { rewardType: "AI_CREDITS" as const, availableUnits: 150, pendingUnits: 0, ledgerAvailableUnits: 150 },
    { rewardType: "API_CREDITS" as const, availableUnits: 20, pendingUnits: 5, ledgerAvailableUnits: 20 },
  ],
  recentLedger: [],
};

function clientWith(getWallet: ReturnType<typeof vi.fn>) {
  return { getWallet } as unknown as SponsorshipApi;
}

describe("reward wallet", () => {
  it("formats available and pending units per reward type", () => {
    expect(formatWallet(WALLET)).toEqual([
      { label: "AI credits", detail: "150 units available, 0 pending" },
      { label: "API credits", detail: "20 units available, 5 pending" },
    ]);
  });

  it("loadWallet calls the SDK's getWallet() (developer id comes from the client credentials) and renders it", async () => {
    const getWallet = vi.fn().mockResolvedValue(WALLET);
    const result = await loadWallet(clientWith(getWallet), true);
    expect(getWallet).toHaveBeenCalledWith();
    expect(result).toEqual({ ok: true, lines: formatWallet(WALLET) });
  });

  it("an empty wallet renders no lines", async () => {
    const result = await loadWallet(clientWith(vi.fn().mockResolvedValue({ ...WALLET, balances: [] })), true);
    expect(result).toEqual({ ok: true, lines: [] });
  });

  it("does not call the server when signed out", async () => {
    const getWallet = vi.fn();
    const result = await loadWallet(clientWith(getWallet), false);
    expect(getWallet).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("degrades to a message on SDK failure instead of throwing", async () => {
    const result = await loadWallet(
      clientWith(vi.fn().mockRejectedValue(new DevAdsError("rejected", "x", { status: 403, reason: "forbidden" }))),
      true
    );
    expect(result).toEqual({ ok: false, message: expect.stringContaining("rejected (forbidden)") });
  });

  it("degrades when no client is available", async () => {
    expect((await loadWallet(null, true)).ok).toBe(false);
  });
});
