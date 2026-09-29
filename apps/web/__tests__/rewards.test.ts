import { describe, expect, it, vi } from "vitest";
import {
  buildWalletView,
  fetchRewardWallet,
  formatLedgerDate,
  formatMonthSummary,
  formatSignedUnits,
  formatUnits,
  isRewardWalletResponse,
  RECENT_LEDGER_LIMIT,
  rewardTypeLabel,
  type RewardLedgerEntry,
  type RewardWalletResponse,
} from "../lib/rewards";

const NOW = new Date("2026-09-29T12:00:00Z");

function entry(overrides: Partial<RewardLedgerEntry>): RewardLedgerEntry {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    rewardType: "AI_CREDITS",
    campaignId: "c1",
    entryType: "EARNED",
    amountUnits: 10,
    status: "APPROVED",
    createdAt: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

function wallet(partial: Partial<RewardWalletResponse>): RewardWalletResponse {
  return { developerId: "dev1", balances: [], recentLedger: [], ...partial };
}

describe("formatUnits", () => {
  it("groups integer digits without float math", () => {
    expect(formatUnits(0)).toBe("0");
    expect(formatUnits(999)).toBe("999");
    expect(formatUnits(1240)).toBe("1,240");
    expect(formatUnits(1234567)).toBe("1,234,567");
    expect(formatUnits(-1240)).toBe("-1,240");
    expect(formatUnits(Number.MAX_SAFE_INTEGER)).toBe("9,007,199,254,740,991");
  });

  it("never pretends a non-integer is a whole unit count", () => {
    expect(formatUnits(12.5)).toBe("12.5");
  });
});

describe("ledger entry formatting", () => {
  it("credits EARNED/ADJUSTMENT and debits REVERSED/REDEEMED/EXPIRED", () => {
    expect(formatSignedUnits({ entryType: "EARNED", amountUnits: 50 })).toBe("+50");
    expect(formatSignedUnits({ entryType: "ADJUSTMENT", amountUnits: 1000 })).toBe("+1,000");
    expect(formatSignedUnits({ entryType: "REDEEMED", amountUnits: 400 })).toBe("-400");
    expect(formatSignedUnits({ entryType: "REVERSED", amountUnits: 5 })).toBe("-5");
    expect(formatSignedUnits({ entryType: "EXPIRED", amountUnits: 7 })).toBe("-7");
  });

  it("formats dates in UTC and survives bad input", () => {
    expect(formatLedgerDate("2026-09-30T23:30:00Z")).toBe("2026-09-30");
    expect(formatLedgerDate("not-a-date")).toBe("Unknown date");
  });

  it("labels reward types, with a fallback", () => {
    expect(rewardTypeLabel("AI_CREDITS")).toBe("AI Credits");
    expect(rewardTypeLabel("SOMETHING_NEW")).toBe("Reward");
  });
});

describe("buildWalletView", () => {
  it("is empty for a developer with no balances or history", () => {
    const view = buildWalletView(wallet({}), NOW);
    expect(view.isEmpty).toBe(true);
    expect(view.cards).toEqual([]);
  });

  it("produces the spec-style card: available, pending and this month's earned/redeemed", () => {
    const view = buildWalletView(
      wallet({
        balances: [{ rewardType: "AI_CREDITS", availableUnits: 1240, pendingUnits: 50, ledgerAvailableUnits: 1240 }],
        recentLedger: [
          entry({ amountUnits: 400, entryType: "REDEEMED", createdAt: "2026-09-20T00:00:00Z" }),
          entry({ amountUnits: 50, status: "PENDING", createdAt: "2026-09-15T00:00:00Z" }),
          entry({ amountUnits: 630, createdAt: "2026-09-01T00:00:00Z" }),
          // Rejected earnings and last month's rows are excluded from "this month".
          entry({ amountUnits: 999, status: "REJECTED", createdAt: "2026-09-02T00:00:00Z" }),
          entry({ amountUnits: 960, createdAt: "2026-08-31T23:59:59Z" }),
        ],
      }),
      NOW
    );
    expect(view.isEmpty).toBe(false);
    expect(view.cards).toHaveLength(1);
    const card = view.cards[0]!;
    expect(card.label).toBe("AI Credits");
    expect(formatUnits(card.availableUnits)).toBe("1,240");
    expect(card.pendingUnits).toBe(50);
    expect(card.thisMonth).toEqual({ earned: 680, redeemed: 400, reversed: 0, expired: 0, adjusted: 0 });
    expect(formatMonthSummary(card.thisMonth)).toBe("+680 earned  -400 redeemed");
    expect(card.balanceMismatch).toBe(false);
    expect(view.monthSummaryMayBeIncomplete).toBe(false);
  });

  it("keeps reward types separate and adds cards for ledger-only types", () => {
    const view = buildWalletView(
      wallet({
        balances: [{ rewardType: "API_CREDITS", availableUnits: 5, pendingUnits: 0, ledgerAvailableUnits: 5 }],
        recentLedger: [
          entry({ rewardType: "API_CREDITS", amountUnits: 5 }),
          entry({ rewardType: "COMPUTE_CREDITS", amountUnits: 3, status: "REJECTED" }),
        ],
      }),
      NOW
    );
    expect(view.cards.map((c) => c.rewardType)).toEqual(["API_CREDITS", "COMPUTE_CREDITS"]);
    expect(view.cards[0]!.thisMonth.earned).toBe(5);
    expect(view.cards[1]!.availableUnits).toBe(0);
    expect(view.cards[1]!.thisMonth.earned).toBe(0);
  });

  it("shows reversed/expired/adjusted in the monthly summary only when present", () => {
    expect(
      formatMonthSummary({ earned: 10, redeemed: 0, reversed: 2, expired: 1, adjusted: 1000 })
    ).toBe("+10 earned  -0 redeemed  -2 reversed  -1 expired  +1,000 adjusted");
  });

  it("flags a cache/ledger mismatch", () => {
    const view = buildWalletView(
      wallet({ balances: [{ rewardType: "CASH", availableUnits: 10, pendingUnits: 0, ledgerAvailableUnits: 8 }] }),
      NOW
    );
    expect(view.cards[0]!.balanceMismatch).toBe(true);
  });

  it("marks monthly totals as possibly incomplete when the full ledger window is still this month", () => {
    const recentLedger = Array.from({ length: RECENT_LEDGER_LIMIT }, (_, i) =>
      entry({ id: `e${i}`, createdAt: "2026-09-05T00:00:00Z" })
    );
    expect(buildWalletView(wallet({ recentLedger }), NOW).monthSummaryMayBeIncomplete).toBe(true);

    const olderTail = [...recentLedger.slice(0, -1), entry({ id: "old", createdAt: "2026-08-01T00:00:00Z" })];
    expect(buildWalletView(wallet({ recentLedger: olderTail }), NOW).monthSummaryMayBeIncomplete).toBe(false);
  });
});

describe("isRewardWalletResponse", () => {
  it("accepts the Phase 1 wallet shape", () => {
    expect(
      isRewardWalletResponse(
        wallet({
          balances: [{ rewardType: "AI_CREDITS", availableUnits: 1, pendingUnits: 0, ledgerAvailableUnits: 1 }],
          recentLedger: [entry({})],
        })
      )
    ).toBe(true);
  });

  it("rejects fractional units, unknown enums and missing arrays", () => {
    expect(
      isRewardWalletResponse(
        wallet({ balances: [{ rewardType: "AI_CREDITS", availableUnits: 1.5, pendingUnits: 0, ledgerAvailableUnits: 1 }] })
      )
    ).toBe(false);
    expect(isRewardWalletResponse(wallet({ recentLedger: [entry({ entryType: "BONUS" as never })] }))).toBe(false);
    expect(isRewardWalletResponse({ developerId: "dev1" })).toBe(false);
    expect(isRewardWalletResponse(null)).toBe(false);
  });
});

describe("fetchRewardWallet", () => {
  it("calls the existing wallet route with the session developerId", async () => {
    const body = wallet({});
    const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: body });
    const result = await fetchRewardWallet("dev 1", get);
    expect(get).toHaveBeenCalledWith("/api/v1/wallet?developerId=dev%201");
    expect(result).toEqual({ status: "ok", wallet: body });
  });

  it("maps 401/403 to unauthenticated", async () => {
    for (const status of [401, 403]) {
      const get = vi.fn().mockResolvedValue({ ok: false, status, data: { error: "x" } });
      expect(await fetchRewardWallet("dev1", get)).toEqual({ status: "unauthenticated" });
    }
  });

  it("returns an error state for server errors, malformed bodies and network failures", async () => {
    const serverError = vi.fn().mockResolvedValue({ ok: false, status: 500, data: {} });
    expect((await fetchRewardWallet("dev1", serverError)).status).toBe("error");

    const malformed = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { balances: "nope" } });
    expect((await fetchRewardWallet("dev1", malformed)).status).toBe("error");

    const offline = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await fetchRewardWallet("dev1", offline)).status).toBe("error");
  });
});
