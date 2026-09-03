import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { buildApp } from "../app.js";

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

    const res = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", payload: { developerId: devId } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("below_payout_threshold");
  });

  it("pays out the full available balance once above the threshold, using the mock provider", async () => {
    if (!dbAvailable) return;

    await prisma.developerEarningsLedger.create({
      data: { developerId: devId, impressionEventId: randomUUID(), amountCents: 2500, description: "test" },
    });

    const res = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", payload: { developerId: devId } });
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
    await app.inject({ method: "POST", url: "/api/v1/earnings/payout", payload: { developerId: devId } });

    const second = await app.inject({ method: "POST", url: "/api/v1/earnings/payout", payload: { developerId: devId } });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe("below_payout_threshold");
  });
});
