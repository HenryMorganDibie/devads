import { describe, expect, it, vi } from "vitest";
import { DevAdsClient, DevAdsError, type FetchLike, type FetchLikeInit } from "../index.js";

const redemptionDTO = {
  id: "red_1",
  rewardType: "AI_CREDITS",
  amountUnits: 30,
  provider: "MANUAL",
  status: "PENDING",
  providerRef: null,
  failureReason: null,
  createdAt: "2026-09-29T10:00:00.000Z",
  completedAt: null,
};

function client(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Array<{ url: string; init: FetchLikeInit }> = [];
  let i = 0;
  const fetch: FetchLike = vi.fn(async (url: string, init: FetchLikeInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body };
  });
  const sdk = new DevAdsClient({
    baseUrl: "http://ads.test",
    credentials: { token: "tok", developerId: "dev_1" },
    fetch,
    generateEventId: () => "key-00000001",
  });
  return { sdk, calls };
}

describe("redeemReward", () => {
  it("sends only the schema fields, with a generated idempotency key, and returns it", async () => {
    const { sdk, calls } = client([{ status: 201, body: { redemption: redemptionDTO, idempotent: false } }]);
    const res = await sdk.redeemReward({
      rewardType: "AI_CREDITS",
      amountUnits: 30,
      // A client cannot smuggle server-owned fields through the SDK.
      ...({ provider: "MOCK", status: "COMPLETED" } as object),
    });
    expect(res).toEqual({ redemption: redemptionDTO, idempotent: false, idempotencyKey: "key-00000001" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://ads.test/api/v1/wallet/redemptions");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body!)).toEqual({
      developerId: "dev_1",
      rewardType: "AI_CREDITS",
      amountUnits: 30,
      idempotencyKey: "key-00000001",
    });
  });

  it("reuses a caller-provided idempotency key", async () => {
    const { sdk, calls } = client([{ status: 200, body: { redemption: redemptionDTO, idempotent: true } }]);
    const res = await sdk.redeemReward({ rewardType: "AI_CREDITS", amountUnits: 30, idempotencyKey: "retry-key-123" });
    expect(res.idempotent).toBe(true);
    expect(JSON.parse(calls[0].init.body!).idempotencyKey).toBe("retry-key-123");
  });

  it("rejects non-positive or fractional amounts without sending anything", async () => {
    const { sdk, calls } = client([{ body: {} }]);
    for (const amountUnits of [0, -1, 2.5]) {
      await expect(sdk.redeemReward({ rewardType: "AI_CREDITS", amountUnits })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(calls).toHaveLength(0);
  });

  it("surfaces server refusals with their reason", async () => {
    const { sdk } = client([{ status: 400, body: { error: "insufficient_balance", availableUnits: 5 } }]);
    const err = await sdk.redeemReward({ rewardType: "AI_CREDITS", amountUnits: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(DevAdsError);
    expect(err).toMatchObject({ code: "rejected", status: 400, reason: "insufficient_balance" });
  });

  it("never returns a malformed redemption", async () => {
    const { sdk } = client([{ status: 201, body: { redemption: { ...redemptionDTO, amountUnits: 1.5 }, idempotent: false } }]);
    await expect(sdk.redeemReward({ rewardType: "AI_CREDITS", amountUnits: 30 })).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("listRedemptions", () => {
  it("queries the signed-in developer's redemptions and validates the response", async () => {
    const body = { redemptionEnabled: true, redeemableRewardTypes: ["AI_CREDITS"], redemptions: [redemptionDTO] };
    const { sdk, calls } = client([{ body }]);
    await expect(sdk.listRedemptions()).resolves.toEqual(body);
    expect(calls[0].url).toBe("http://ads.test/api/v1/wallet/redemptions?developerId=dev_1");
  });
});
