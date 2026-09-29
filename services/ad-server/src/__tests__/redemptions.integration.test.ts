import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import {
  ManualRedemptionProvider,
  MockRedemptionProvider,
  RedeemRewardResponseSchema,
  RewardRedemptionListResponseSchema,
  type RedemptionProvider,
} from "@devads/shared";
import { buildApp } from "../app.js";
import { setDomainEventSink, type DomainEvent } from "../lib/domainEvents.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

let dbAvailable = true;
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A fresh app per test: each has its own rate-limit store and provider. */
async function appWith(provider: RedemptionProvider | null) {
  const app = await buildApp({ redemptionProvider: provider });
  await app.ready();
  apps.push(app);
  return app;
}

const advertiserId = "test-redeem-advertiser";
const campaignId = "test-redeem-campaign";
const userA = "test-redeem-user-a";
const devA = "test-redeem-developer-a";
const userB = "test-redeem-user-b";
const devB = "test-redeem-developer-b";
const adminUser = "test-redeem-admin";
const STARTING_UNITS = 100;

const auth = (sub: string, role: "DEVELOPER" | "ADMIN" = "DEVELOPER") => ({
  authorization: `Bearer ${signSession({ sub, role }, SESSION_SECRET)}`,
});

beforeEach(async () => {
  if (!dbAvailable) return;
  const devs = [devA, devB];
  await prisma.developerRewardLedger.deleteMany({ where: { developerId: { in: devs } } });
  await prisma.rewardRedemption.deleteMany({ where: { developerId: { in: devs } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: { in: devs } } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Redemption Test Sponsor (DEMO)" },
  });
  // DRAFT: never selectable for offers, only the campaign earned rewards belong to.
  const campaign = {
    advertiserId,
    name: "Redemption Test Campaign",
    objective: "QUALIFIED_ENGAGEMENT" as const,
    rewardType: "AI_CREDITS" as const,
    rewardAmountUnits: 10,
    sponsorChargeCents: 10,
    status: "DRAFT" as const,
    eligibleClientTypes: ["LOCAL_AGENT" as const],
  };
  await prisma.sponsorshipCampaign.upsert({ where: { id: campaignId }, update: campaign, create: { id: campaignId, ...campaign } });

  for (const [userId, developerId] of [
    [userA, devA],
    [userB, devB],
  ]) {
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
    });
    await prisma.developerProfile.upsert({ where: { id: developerId }, update: {}, create: { id: developerId, userId } });
  }

  // devA has earned 100 AI credits: an approved EARNED ledger row and the matching wallet cache.
  await prisma.developerRewardLedger.create({
    data: {
      developerId: devA,
      rewardType: "AI_CREDITS",
      campaignId,
      entryType: "EARNED",
      amountUnits: STARTING_UNITS,
      status: "APPROVED",
    },
  });
  await prisma.developerRewardWallet.create({
    data: { developerId: devA, rewardType: "AI_CREDITS", availableUnits: STARTING_UNITS },
  });
});

async function redeem(
  app: Awaited<ReturnType<typeof buildApp>>,
  body: Record<string, unknown>,
  userId = userA
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/wallet/redemptions",
    headers: auth(userId),
    payload: { developerId: devA, rewardType: "AI_CREDITS", idempotencyKey: randomUUID(), ...body },
  });
  return { status: res.statusCode, body: res.json() };
}

async function wallet(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devA}`, headers: auth(userA) });
  expect(res.statusCode).toBe(200);
  const balance = res.json().balances.find((b: { rewardType: string }) => b.rewardType === "AI_CREDITS");
  return { cached: balance.availableUnits as number, ledger: balance.ledgerAvailableUnits as number };
}

async function adminPost(app: Awaited<ReturnType<typeof buildApp>>, path: string, payload: Record<string, unknown> = {}) {
  const res = await app.inject({ method: "POST", url: path, headers: auth(adminUser, "ADMIN"), payload });
  return { status: res.statusCode, body: res.json() };
}

describe("redeeming rewards", () => {
  it("debits the ledger and the wallet, and returns a completed redemption (mock provider)", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const res = await redeem(app, { amountUnits: 30 });
    expect(res.status).toBe(201);
    const parsed = RedeemRewardResponseSchema.parse(res.body);
    expect(parsed.idempotent).toBe(false);
    expect(parsed.redemption).toMatchObject({ amountUnits: 30, rewardType: "AI_CREDITS", provider: "MOCK", status: "COMPLETED" });
    expect(parsed.redemption.completedAt).not.toBeNull();

    expect(await wallet(app)).toEqual({ cached: 70, ledger: 70 });
    const debit = await prisma.developerRewardLedger.findFirstOrThrow({ where: { developerId: devA, entryType: "REDEEMED" } });
    expect(debit).toMatchObject({ amountUnits: 30, status: "APPROVED", campaignId: null, redemptionId: parsed.redemption.id });
  });

  it("replaying the idempotency key returns the original redemption and debits nothing", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const idempotencyKey = randomUUID();
    const first = await redeem(app, { amountUnits: 25, idempotencyKey });
    const again = await redeem(app, { amountUnits: 25, idempotencyKey });
    expect(again.status).toBe(200);
    expect(again.body.idempotent).toBe(true);
    expect(again.body.redemption.id).toBe(first.body.redemption.id);
    expect(await wallet(app)).toEqual({ cached: 75, ledger: 75 });
    expect(await prisma.rewardRedemption.count({ where: { developerId: devA } })).toBe(1);

    const reused = await redeem(app, { amountUnits: 26, idempotencyKey });
    expect(reused).toMatchObject({ status: 409, body: { error: "idempotency_key_reused" } });
  });

  it("rejects redeeming more than the ledger balance, writing nothing", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const res = await redeem(app, { amountUnits: STARTING_UNITS + 1 });
    expect(res).toMatchObject({ status: 400, body: { error: "insufficient_balance", availableUnits: STARTING_UNITS } });
    expect(await prisma.rewardRedemption.count({ where: { developerId: devA } })).toBe(0);
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });
  });

  it("rejects a reward type the developer has no balance in", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const res = await redeem(app, { amountUnits: 1, rewardType: "API_CREDITS" });
    expect(res).toMatchObject({ status: 400, body: { error: "insufficient_balance", availableUnits: 0 } });
  });

  it("rejects malformed amounts and ignores client-supplied provider, status and reward values", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    for (const amountUnits of [0, -5, 1.5, "10"]) {
      expect((await redeem(app, { amountUnits })).status).toBe(400);
    }
    const res = await redeem(app, { amountUnits: 10, provider: "MOCK", status: "COMPLETED", providerRef: "x", completedAt: "now" });
    expect(res.status).toBe(201);
    expect(res.body.redemption).toMatchObject({ provider: "MANUAL", status: "PENDING", providerRef: null });
  });

  it("concurrent redemptions can never overdraw the balance", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const results = await Promise.all(Array.from({ length: 10 }, () => redeem(app, { amountUnits: 15 })));
    const ok = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 400);
    expect(ok).toHaveLength(6); // 6 x 15 = 90 <= 100; a 7th would need 105
    expect(refused).toHaveLength(4);
    for (const r of refused) expect(r.body.error).toBe("insufficient_balance");
    expect(await wallet(app)).toEqual({ cached: 10, ledger: 10 });
  });

  it("is refused while no provider is configured, and the listing says so", async () => {
    if (!dbAvailable) return;
    const app = await appWith(null);
    expect(await redeem(app, { amountUnits: 10 })).toMatchObject({ status: 503, body: { error: "redemption_disabled" } });
    const list = await app.inject({ method: "GET", url: `/api/v1/wallet/redemptions?developerId=${devA}`, headers: auth(userA) });
    expect(RewardRedemptionListResponseSchema.parse(list.json())).toEqual({
      redemptionEnabled: false,
      redeemableRewardTypes: [],
      redemptions: [],
    });
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });
  });

  it("refuses reward types the provider does not support", async () => {
    if (!dbAvailable) return;
    const onlyApi: RedemptionProvider = {
      kind: "API_ONLY_TEST",
      supportsRewardType: (t) => t === "API_CREDITS",
      redeem: async () => ({ providerRef: "r", status: "COMPLETED" }),
    };
    const app = await appWith(onlyApi);
    expect(await redeem(app, { amountUnits: 10 })).toMatchObject({ status: 400, body: { error: "reward_type_not_redeemable" } });
    const list = await app.inject({ method: "GET", url: `/api/v1/wallet/redemptions?developerId=${devA}`, headers: auth(userA) });
    expect(list.json().redeemableRewardTypes).toEqual(["API_CREDITS"]);
  });
});

describe("provider failure returns the units", () => {
  it("a FAILED provider result appends a compensating credit and restores the balance", async () => {
    if (!dbAvailable) return;
    const failing: RedemptionProvider = {
      kind: "FAILING_TEST",
      supportsRewardType: () => true,
      redeem: async () => ({ providerRef: "", status: "FAILED", failureReason: "destination_unavailable" }),
    };
    const app = await appWith(failing);
    const res = await redeem(app, { amountUnits: 40 });
    expect(res.status).toBe(201);
    expect(res.body.redemption).toMatchObject({ status: "FAILED", failureReason: "destination_unavailable" });
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });

    const rows = await prisma.developerRewardLedger.findMany({ where: { redemptionId: res.body.redemption.id }, orderBy: { entryType: "asc" } });
    expect(rows.map((r) => [r.entryType, r.amountUnits, r.status])).toEqual([
      ["REDEEMED", 40, "REJECTED"],
      ["ADJUSTMENT", 40, "APPROVED"],
    ]);
  });

  it("a provider that throws is treated as FAILED", async () => {
    if (!dbAvailable) return;
    const throwing: RedemptionProvider = {
      kind: "THROWING_TEST",
      supportsRewardType: () => true,
      redeem: async () => {
        throw new Error("upstream down with secret details");
      },
    };
    const app = await appWith(throwing);
    const res = await redeem(app, { amountUnits: 40 });
    expect(res.body.redemption).toMatchObject({ status: "FAILED", failureReason: "provider_error" });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });
  });
});

describe("operator-fulfilled (manual) redemptions", () => {
  it("stay PENDING with the units reserved until an admin completes them", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    const res = await redeem(app, { amountUnits: 60 });
    expect(res.body.redemption).toMatchObject({ status: "PENDING", provider: "MANUAL" });
    expect(await wallet(app)).toEqual({ cached: 40, ledger: 40 });
    // Reserved units cannot be spent twice.
    expect((await redeem(app, { amountUnits: 41 })).body.error).toBe("insufficient_balance");

    const queue = await app.inject({ method: "GET", url: "/api/v1/admin/redemptions?status=PENDING", headers: auth(adminUser, "ADMIN") });
    expect(queue.json().redemptions.map((r: { id: string }) => r.id)).toContain(res.body.redemption.id);

    const done = await adminPost(app, `/api/v1/admin/redemptions/${res.body.redemption.id}/complete`, { providerRef: "ticket-123" });
    expect(done.status).toBe(200);
    expect(done.body.redemption).toMatchObject({ status: "COMPLETED", providerRef: "ticket-123", developerId: devA });
    expect(await wallet(app)).toEqual({ cached: 40, ledger: 40 });
    const debit = await prisma.developerRewardLedger.findFirstOrThrow({ where: { redemptionId: res.body.redemption.id } });
    expect(debit.status).toBe("APPROVED");

    // Terminal: neither a second completion nor a late failure changes anything.
    expect((await adminPost(app, `/api/v1/admin/redemptions/${res.body.redemption.id}/complete`)).status).toBe(409);
    expect((await adminPost(app, `/api/v1/admin/redemptions/${res.body.redemption.id}/fail`, { reason: "late" })).status).toBe(409);
    expect(await wallet(app)).toEqual({ cached: 40, ledger: 40 });
  });

  it("an admin failure refunds exactly once", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    const res = await redeem(app, { amountUnits: 60 });
    const id = res.body.redemption.id;

    const [a, b] = await Promise.all([
      adminPost(app, `/api/v1/admin/redemptions/${id}/fail`, { reason: "sponsor_out_of_codes" }),
      adminPost(app, `/api/v1/admin/redemptions/${id}/fail`, { reason: "sponsor_out_of_codes" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });
    expect(await prisma.developerRewardLedger.count({ where: { redemptionId: id, entryType: "ADJUSTMENT" } })).toBe(1);
  });

  it("racing complete and fail: exactly one wins and the books still balance", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    const res = await redeem(app, { amountUnits: 50 });
    const id = res.body.redemption.id;
    const [done, failed] = await Promise.all([
      adminPost(app, `/api/v1/admin/redemptions/${id}/complete`),
      adminPost(app, `/api/v1/admin/redemptions/${id}/fail`, { reason: "race" }),
    ]);
    expect([done.status, failed.status].sort()).toEqual([200, 409]);
    const final = await prisma.rewardRedemption.findUniqueOrThrow({ where: { id } });
    expect(await wallet(app)).toEqual(final.status === "COMPLETED" ? { cached: 50, ledger: 50 } : { cached: 100, ledger: 100 });
  });

  it("unknown redemptions and invalid bodies are rejected", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    expect((await adminPost(app, "/api/v1/admin/redemptions/does-not-exist/complete")).status).toBe(404);
    const res = await redeem(app, { amountUnits: 5 });
    expect((await adminPost(app, `/api/v1/admin/redemptions/${res.body.redemption.id}/fail`, {})).status).toBe(400);
  });
});

describe("redemption authorization", () => {
  it("a developer cannot redeem from or read another developer's wallet", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    expect(await redeem(app, { amountUnits: 10 }, userB)).toMatchObject({ status: 403, body: { error: "forbidden" } });
    const list = await app.inject({ method: "GET", url: `/api/v1/wallet/redemptions?developerId=${devA}`, headers: auth(userB) });
    expect(list.statusCode).toBe(403);
    expect(await wallet(app)).toEqual({ cached: STARTING_UNITS, ledger: STARTING_UNITS });
  });

  it("unauthenticated callers are refused", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wallet/redemptions",
      payload: { developerId: devA, rewardType: "AI_CREDITS", amountUnits: 10, idempotencyKey: randomUUID() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("developers cannot use the admin settlement routes", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new ManualRedemptionProvider());
    const res = await redeem(app, { amountUnits: 10 });
    for (const path of [`/api/v1/admin/redemptions/${res.body.redemption.id}/complete`, `/api/v1/admin/redemptions/${res.body.redemption.id}/fail`]) {
      const r = await app.inject({ method: "POST", url: path, headers: auth(userA), payload: { reason: "mine" } });
      expect(r.statusCode).toBe(403);
    }
    const list = await app.inject({ method: "GET", url: "/api/v1/admin/redemptions", headers: auth(userA) });
    expect(list.statusCode).toBe(403);
    expect((await prisma.rewardRedemption.findUniqueOrThrow({ where: { id: res.body.redemption.id } })).status).toBe("PENDING");
  });

  it("is rate limited per client", async () => {
    if (!dbAvailable) return;
    const app = await appWith(new MockRedemptionProvider());
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await redeem(app, { amountUnits: 1 })).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("redemption observability", () => {
  it("emits structured events carrying only identifiers, types, units, statuses and reason codes", async () => {
    if (!dbAvailable) return;
    const events: DomainEvent[] = [];
    const previous = setDomainEventSink((e) => events.push(e));
    try {
      const app = await appWith(new MockRedemptionProvider());
      await redeem(app, { amountUnits: 10 });
      await redeem(app, { amountUnits: 1000 });
      const disabled = await appWith(null);
      await redeem(disabled, { amountUnits: 1 });
    } finally {
      setDomainEventSink(previous);
    }
    const mine = events.filter((e) => e.developerId === devA);
    expect(mine.map((e) => e.event)).toEqual([
      "reward.redemption.requested",
      "reward.redemption.completed",
      "reward.redemption.rejected",
      "reward.redemption.rejected",
    ]);
    const allowed = new Set(["event", "at", "redemptionId", "developerId", "rewardType", "amountUnits", "provider", "actor", "reason"]);
    for (const e of mine) {
      for (const key of Object.keys(e)) expect(allowed.has(key), key).toBe(true);
      for (const value of Object.values(e)) expect(["string", "number", "boolean"]).toContain(typeof value);
    }
    expect(mine.filter((e) => e.event === "reward.redemption.rejected").map((e) => e.reason)).toEqual([
      "insufficient_balance",
      "redemption_disabled",
    ]);
  });
});

describe("reconciliation", () => {
  it("after mixed activity the wallet cache equals the ledger, and every redemption has exactly one debit", async () => {
    if (!dbAvailable) return;
    const manualApp = await appWith(new ManualRedemptionProvider());
    const a = await redeem(manualApp, { amountUnits: 20 });
    const b = await redeem(manualApp, { amountUnits: 15 });
    await redeem(manualApp, { amountUnits: 5 });
    await adminPost(manualApp, `/api/v1/admin/redemptions/${a.body.redemption.id}/complete`);
    await adminPost(manualApp, `/api/v1/admin/redemptions/${b.body.redemption.id}/fail`, { reason: "test" });
    const mockApp = await appWith(new MockRedemptionProvider());
    await redeem(mockApp, { amountUnits: 7 });

    // 100 - 20 (completed) - 5 (pending, reserved) - 7 (completed); 15 was refunded.
    expect(await wallet(mockApp)).toEqual({ cached: 68, ledger: 68 });
    const redemptions = await prisma.rewardRedemption.findMany({ where: { developerId: devA }, include: { ledgerEntries: true } });
    expect(redemptions).toHaveLength(4);
    for (const r of redemptions) {
      expect(r.ledgerEntries.filter((e) => e.entryType === "REDEEMED")).toHaveLength(1);
      expect(r.ledgerEntries.filter((e) => e.entryType === "ADJUSTMENT")).toHaveLength(r.status === "FAILED" ? 1 : 0);
    }
  });

  it("the database refuses a redemption debit without a redemption and an earned row without a campaign", async () => {
    if (!dbAvailable) return;
    await expect(
      prisma.developerRewardLedger.create({
        data: { developerId: devA, rewardType: "AI_CREDITS", entryType: "REDEEMED", amountUnits: 1, status: "APPROVED" },
      })
    ).rejects.toThrow();
    await expect(
      prisma.developerRewardLedger.create({
        data: { developerId: devA, rewardType: "AI_CREDITS", entryType: "EARNED", amountUnits: 1, status: "APPROVED" },
      })
    ).rejects.toThrow();
  });
});
