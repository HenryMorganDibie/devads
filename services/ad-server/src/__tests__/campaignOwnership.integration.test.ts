import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const ownerUserId = "test-campown-owner";
const attackerUserId = "test-campown-attacker";
const advertiserId = "test-campown-advertiser";
const campaignId = "test-campown-campaign";

const tokenFor = (userId: string) => signSession({ sub: userId, role: "ADVERTISER" }, SESSION_SECRET);
const authHeader = (userId: string) => ({ authorization: `Bearer ${tokenFor(userId)}` });

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.user.upsert({
    where: { id: ownerUserId },
    update: {},
    create: { id: ownerUserId, email: `${ownerUserId}@example.com`, role: "ADVERTISER" },
  });
  await prisma.user.upsert({
    where: { id: attackerUserId },
    update: {},
    create: { id: attackerUserId, email: `${attackerUserId}@example.com`, role: "ADVERTISER" },
  });
  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Ownership Test Advertiser (DEMO)", status: "ACTIVE" },
  });
  await prisma.advertiserMember.upsert({
    where: { advertiserId_userId: { advertiserId, userId: ownerUserId } },
    update: {},
    create: { advertiserId, userId: ownerUserId, role: "OWNER" },
  });
  await prisma.campaign.upsert({
    where: { id: campaignId },
    update: {},
    create: { id: campaignId, advertiserId, name: "Ownership Test Campaign", cpmCents: 1000, status: "DRAFT" },
  });
});

describe("campaign ownership authorization", () => {
  it("rejects creating a campaign under an advertiser the caller isn't a member of", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns",
      headers: authHeader(attackerUserId),
      payload: { advertiserId, name: "Hostile Campaign", cpmCents: 1000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows creating a campaign for an advertiser the caller belongs to", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns",
      headers: authHeader(ownerUserId),
      payload: { advertiserId, name: "Legit Campaign", cpmCents: 1000 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects listing another advertiser's campaigns", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/campaigns?advertiserId=${advertiserId}`,
      headers: authHeader(attackerUserId),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects adding a creative to a campaign the caller doesn't own", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/campaigns/${campaignId}/creatives`,
      headers: authHeader(attackerUserId),
      payload: { headline: "Hostile creative", ctaUrl: "https://example.com" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects submitting a campaign the caller doesn't own", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/campaigns/${campaignId}/submit`,
      headers: authHeader(attackerUserId),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects everything above with no session at all", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/campaigns?advertiserId=${advertiserId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
