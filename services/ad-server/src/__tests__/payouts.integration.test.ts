import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import { buildApp } from "../app.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
    return;
  }
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

const userId = "test-payout-user";
const devId = "test-payout-developer";
const authHeader = () => ({
  authorization: `Bearer ${signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET)}`,
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.payout.deleteMany({ where: { developerId: devId } });
  await prisma.developerEarningsLedger.deleteMany({ where: { developerId: devId } });
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: devId },
    update: { payoutThresholdCents: 2000 },
    create: { id: devId, userId, payoutThresholdCents: 2000 },
  });
});

describe("payouts", () => {
  it("rejects a payout request below the minimum threshold", async () => {
    if (!dbAvailable) return;

    await prisma.developerEarningsLedger.create({
      data: { developerId: devId, impressionEventId: randomUUID(), amountCents: 500, description: "test" },
    });

    const res = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("below_payout_threshold");
  });

  it("pays out the full available balance once above the threshold, using the mock provider", async () => {
    if (!dbAvailable) return;

    await prisma.developerEarningsLedger.create({
      data: { developerId: devId, impressionEventId: randomUUID(), amountCents: 2500, description: "test" },
    });

    const res = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.amountCents).toBe(2500);
    expect(body.status).toBe("PAID");

    const payout = await prisma.payout.findUnique({ where: { id: body.id } });
    expect(payout?.status).toBe("PAID");
    expect(payout?.providerRef).toBeTruthy();
  });

  it("never double-counts an already-paid-out balance on a second request", async () => {
    if (!dbAvailable) return;

    await prisma.developerEarningsLedger.create({
      data: { developerId: devId, impressionEventId: randomUUID(), amountCents: 2500, description: "test" },
    });
    await app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } });

    const second = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe("below_payout_threshold");
  });

  it("never double-pays when two payout requests for the same developer race concurrently", async () => {
    if (!dbAvailable) return;

    await prisma.developerEarningsLedger.create({
      data: { developerId: devId, impressionEventId: randomUUID(), amountCents: 2500, description: "test" },
    });

    // Fire both requests truly concurrently -- this is exactly the
    // double-click / retry scenario that a naive check-then-act balance
    // calculation (read available -> create payout) fails under: both
    // requests can read the same "available" balance before either
    // payout row exists.
    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } }),
      app.inject({ method: "POST", url: "/api/v1/earnings/payout", headers: authHeader(), payload: { developerId: devId } }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    // Exactly one must succeed (200) and the other must be rejected as
    // below threshold (400) -- never both succeeding.
    expect(statuses).toEqual([200, 400]);

    const payouts = await prisma.payout.findMany({ where: { developerId: devId } });
    expect(payouts.length).toBe(1);
    expect(payouts[0].amountCents).toBe(2500);

    // Total ever paid must equal the true balance, not 2x it.
    const paidTotal = payouts
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amountCents, 0);
    expect(paidTotal).toBeLessThanOrEqual(2500);
  });
});
