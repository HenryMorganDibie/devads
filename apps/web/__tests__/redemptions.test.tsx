import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RedemptionPanel } from "../components/RedemptionPanel";
import { RewardWalletView } from "../components/RewardWalletView";
import { isRewardWalletResponse, type RewardWalletResponse } from "../lib/rewards";
import {
  describeRedemptionOutcome,
  fetchRedemptions,
  isRedemptionListResponse,
  parseRedeemAmount,
  requestRedemption,
  type RedemptionListResponse,
  type RewardRedemption,
} from "../lib/redemptions";

const NOW = new Date("2026-09-29T12:00:00Z");

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function redemption(overrides: Partial<RewardRedemption> = {}): RewardRedemption {
  return {
    id: "red_1",
    rewardType: "AI_CREDITS",
    amountUnits: 300,
    provider: "MANUAL",
    status: "PENDING",
    providerRef: null,
    failureReason: null,
    createdAt: "2026-09-28T10:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

const enabled: RedemptionListResponse = {
  redemptionEnabled: true,
  redeemableRewardTypes: ["AI_CREDITS", "API_CREDITS"],
  redemptions: [redemption(), redemption({ id: "red_2", status: "FAILED", amountUnits: 40 })],
};

const walletWithRedemption: RewardWalletResponse = {
  developerId: "dev1",
  balances: [{ rewardType: "AI_CREDITS", availableUnits: 940, pendingUnits: 0, ledgerAvailableUnits: 940 }],
  recentLedger: [
    {
      id: "l1",
      rewardType: "AI_CREDITS",
      campaignId: null,
      entryType: "REDEEMED",
      amountUnits: 300,
      status: "PENDING",
      createdAt: "2026-09-28T10:00:00Z",
    },
    {
      id: "l2",
      rewardType: "AI_CREDITS",
      campaignId: "c1",
      entryType: "EARNED",
      amountUnits: 1240,
      status: "APPROVED",
      createdAt: "2026-09-02T08:00:00Z",
    },
  ],
};

describe("wallet response with redemption rows", () => {
  it("accepts ledger entries without a campaign (regression: a redemption must not break the wallet page)", () => {
    expect(isRewardWalletResponse(walletWithRedemption)).toBe(true);
    const out = text(renderToStaticMarkup(<RewardWalletView state={{ status: "ok", wallet: walletWithRedemption }} now={NOW} />));
    expect(out).toContain("2026-09-28 AI Credits Redeemed -300 Pending");
  });

  it("still rejects a non-string, non-null campaign id", () => {
    const bad = { ...walletWithRedemption, recentLedger: [{ ...walletWithRedemption.recentLedger[0], campaignId: 7 }] };
    expect(isRewardWalletResponse(bad)).toBe(false);
  });

  it("only says redemption is available when the server reports it enabled", () => {
    const state = { status: "ok" as const, wallet: walletWithRedemption };
    expect(text(renderToStaticMarkup(<RewardWalletView state={state} now={NOW} />))).toContain(
      "Redeeming rewards isn't available yet"
    );
    const on = text(renderToStaticMarkup(<RewardWalletView state={state} now={NOW} redemptionEnabled />));
    expect(on).toContain("You can redeem available units below");
    expect(on).not.toContain("isn't available yet");
  });
});

describe("parseRedeemAmount", () => {
  it("accepts whole positive units up to the available balance", () => {
    expect(parseRedeemAmount(" 250 ", 300)).toEqual({ ok: true, units: 250 });
    expect(parseRedeemAmount("300", 300)).toEqual({ ok: true, units: 300 });
  });

  it("rejects fractions, signs, zero, junk and amounts above the balance", () => {
    for (const raw of ["", "0", "-5", "1.5", "1e3", "abc", "12 3"]) expect(parseRedeemAmount(raw, 1000).ok).toBe(false);
    expect(parseRedeemAmount("301", 300)).toEqual({ ok: false, message: "That's more than your available balance." });
  });
});

describe("redemption API helpers", () => {
  it("validates the list response strictly", () => {
    expect(isRedemptionListResponse(enabled)).toBe(true);
    expect(isRedemptionListResponse({ ...enabled, redemptions: [redemption({ amountUnits: 1.5 })] })).toBe(false);
    expect(isRedemptionListResponse({ ...enabled, redemptions: [{ ...redemption(), status: "DONE" }] })).toBe(false);
    expect(isRedemptionListResponse({ ...enabled, redeemableRewardTypes: ["GOLD"] })).toBe(false);
  });

  it("loads redemptions for the developer and maps auth failures", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: enabled });
    await expect(fetchRedemptions("dev 1", get)).resolves.toEqual({ status: "ok", data: enabled });
    expect(get).toHaveBeenCalledWith("/api/v1/wallet/redemptions?developerId=dev%201");
    const forbidden = vi.fn().mockResolvedValue({ ok: false, status: 403, data: {} });
    await expect(fetchRedemptions("dev1", forbidden)).resolves.toEqual({ status: "unauthenticated" });
  });

  it("sends only the reward type, integer units and idempotency key", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, status: 201, data: { redemption: redemption(), idempotent: false } });
    const res = await requestRedemption({ developerId: "dev1", rewardType: "AI_CREDITS", amountUnits: 300, idempotencyKey: "k-1" }, post);
    expect(res).toEqual({ status: "ok", redemption: redemption() });
    expect(post).toHaveBeenCalledWith("/api/v1/wallet/redemptions", {
      developerId: "dev1",
      rewardType: "AI_CREDITS",
      amountUnits: 300,
      idempotencyKey: "k-1",
    });
  });

  it("maps server refusals to plain messages; only transport failures and rate limits are retryable", async () => {
    const input = { developerId: "dev1", rewardType: "AI_CREDITS" as const, amountUnits: 5, idempotencyKey: "k" };
    const refusal = vi.fn().mockResolvedValue({ ok: false, status: 400, data: { error: "insufficient_balance" } });
    await expect(requestRedemption(input, refusal)).resolves.toEqual({
      status: "error",
      message: "That's more than your available balance.",
      retryable: false,
    });
    const limited = vi.fn().mockResolvedValue({ ok: false, status: 429, data: {} });
    expect(await requestRedemption(input, limited)).toMatchObject({ status: "error", retryable: true });
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await requestRedemption(input, offline)).toMatchObject({ status: "error", retryable: true });
    const malformed = vi.fn().mockResolvedValue({ ok: true, status: 201, data: { redemption: { id: 1 } } });
    expect(await requestRedemption(input, malformed)).toMatchObject({ status: "error", retryable: false });
  });

  it("describes every outcome honestly", () => {
    expect(describeRedemptionOutcome(redemption({ status: "COMPLETED" }))).toContain("delivered");
    expect(describeRedemptionOutcome(redemption({ status: "PENDING" }))).toContain("reserved");
    expect(describeRedemptionOutcome(redemption({ status: "FAILED" }))).toContain("returned");
  });
});

describe("RedemptionPanel", () => {
  const noop = vi.fn();

  it("offers only reward types the provider supports and the developer has units in", () => {
    const out = renderToStaticMarkup(
      <RedemptionPanel
        state={{ status: "ok", data: enabled }}
        balances={[
          { rewardType: "AI_CREDITS", availableUnits: 940 },
          { rewardType: "API_CREDITS", availableUnits: 0 },
          { rewardType: "DISCOUNT", availableUnits: 50 },
        ]}
        onRedeem={noop}
      />
    );
    expect(text(out)).toContain("AI Credits (940 available)");
    expect(out).not.toContain("API Credits (");
    expect(out).not.toContain("Discount (");
    expect(text(out)).toContain("Redeem");
  });

  it("shows the history with plain status labels", () => {
    const out = text(
      renderToStaticMarkup(<RedemptionPanel state={{ status: "ok", data: enabled }} balances={[]} onRedeem={noop} />)
    );
    expect(out).toContain("You have no available units that can be redeemed yet");
    expect(out).toContain("2026-09-28 AI Credits 300 Requested");
    expect(out).toContain("AI Credits 40 Failed, units returned");
  });

  it("renders nothing when redemption is disabled and there is no history", () => {
    const disabled = { redemptionEnabled: false, redeemableRewardTypes: [], redemptions: [] };
    expect(renderToStaticMarkup(<RedemptionPanel state={{ status: "ok", data: disabled }} balances={[]} onRedeem={noop} />)).toBe("");
  });

  it("keeps showing past redemptions when redemption is later disabled, without a form", () => {
    const disabled = { redemptionEnabled: false, redeemableRewardTypes: [], redemptions: [redemption({ status: "COMPLETED" })] };
    const out = renderToStaticMarkup(
      <RedemptionPanel state={{ status: "ok", data: disabled }} balances={[{ rewardType: "AI_CREDITS", availableUnits: 10 }]} onRedeem={noop} />
    );
    expect(out).not.toContain("<form");
    expect(text(out)).toContain("isn't available right now");
    expect(text(out)).toContain("Delivered");
  });
});
