import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { buildApp } from "../app.js";

/**
 * Integration test against a real Postgres (DATABASE_URL from env, expected
 * to point at the docker-compose devads-postgres instance). Exercises the
 * full campaign -> ad selection -> impression -> qualified view -> earnings
 * ledger path end to end through the actual HTTP routes.
 *
 * Skips automatically if no DATABASE_URL is configured / reachable, so the
 * unit-test-only workflow (`vitest run` without docker-compose up) still
 * passes.
 */

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

// Stable fixture ids (not random) so repeated local test runs upsert the
// same rows instead of accumulating stale campaigns that could win ad
// selection over the current run's fixtures.
const advertiserId = "test-fixture-advertiser";
const campaignId = "test-fixture-campaign";
const creativeId = "test-fixture-creative";
const userId = "test-fixture-user";
const devId = "test-fixture-developer";

beforeEach(async () => {
  if (!dbAvailable) return;
  // Reset per-test-run state that selection/idempotency logic depends on,
  // so each run starts from a clean slate regardless of prior runs.
  await prisma.developerEarningsLedger.deleteMany({ where: { developerId: devId } });
  await prisma.campaignSpend.deleteMany({ where: { campaignId } });
  await prisma.clickEvent.deleteMany({ where: { campaignId } });
  await prisma.adEvent.deleteMany({ where: { developerId: devId } });
  await prisma.adImpression.deleteMany({ where: { developerId: devId } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Integration Test Advertiser (DEMO)" },
  });
  await prisma.campaign.upsert({
    where: { id: campaignId },
    update: { status: "APPROVED" },
    create: {
      id: campaignId,
      advertiserId,
      name: "Integration Test Campaign",
      status: "APPROVED",
      isDemo: true,
      cpmCents: 20000, // $200 CPM so per-impression earnings are non-zero cents
      currency: "USD",
      targets: {
        create: {
          languages: ["typescript"],
          frameworks: [],
          runtimes: [],
          platforms: [],
          countries: [],
          categories: [],
        },
      },
    },
  });
  await prisma.campaignCreative.upsert({
    where: { id: creativeId },
    update: {},
    create: {
      id: creativeId,
      campaignId,
      type: "IMAGE",
      headline: "Test Headline",
      ctaLabel: "Learn more",
      ctaUrl: "https://example.com",
    },
  });
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: devId },
    update: { adsEnabled: true },
    create: { id: devId, userId },
  });
});

describe("ad-server integration", () => {
  it("selects no ad when elapsed time is below threshold context implies", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: { context: { developerId: devId, command: "npm", language: "rust", elapsedSeconds: 30 } },
    });
    expect(res.statusCode).toBe(200);
    // language "rust" doesn't match targeted "typescript" -> no eligible campaign
    expect(res.json().ad).toBeNull();
  });

  it("never selects an ad once the developer has disabled DevAds, even if a stale/malicious client still asks", async () => {
    if (!dbAvailable) return;

    await prisma.developerProfile.update({ where: { id: devId }, data: { adsEnabled: false } });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: {
        context: { developerId: devId, command: "npm", language: "typescript", elapsedSeconds: 30 },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ad).toBeNull();

    // restore for subsequent tests
    await prisma.developerProfile.update({ where: { id: devId }, data: { adsEnabled: true } });
  });

  it("selects the targeted campaign, records an impression, and pays out on a qualified view", async () => {
    if (!dbAvailable) return;

    const selectRes = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: {
        context: { developerId: devId, command: "npm", language: "typescript", elapsedSeconds: 30 },
      },
    });
    expect(selectRes.statusCode).toBe(200);
    const ad = selectRes.json().ad;
    expect(ad).not.toBeNull();
    expect(ad.campaignId).toBe(campaignId);

    const impression = await prisma.adImpression.findUnique({ where: { id: ad.impressionId } });
    expect(impression).not.toBeNull();

    const viewRes = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: {
        eventId: randomUUID(),
        type: "VIEW_COMPLETE",
        campaignId,
        impressionId: ad.impressionId,
        developerId: devId,
        viewDurationMs: 3000,
      },
    });
    expect(viewRes.statusCode).toBe(200);

    const ledgerEntry = await prisma.developerEarningsLedger.findUnique({
      where: { impressionEventId: impression!.eventId },
    });
    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry!.amountCents).toBeGreaterThan(0);
  });

  it("does not double-pay when the same VIEW_COMPLETE event is retried (idempotency)", async () => {
    if (!dbAvailable) return;

    const selectRes = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: {
        context: { developerId: devId, command: "npm", language: "typescript", elapsedSeconds: 30 },
      },
    });
    const ad = selectRes.json().ad;
    const eventId = randomUUID();
    const payload = {
      eventId,
      type: "VIEW_COMPLETE",
      campaignId,
      impressionId: ad.impressionId,
      developerId: devId,
      viewDurationMs: 3000,
    };

    const first = await app.inject({ method: "POST", url: "/api/v1/events", payload });
    const second = await app.inject({ method: "POST", url: "/api/v1/events", payload });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().idempotent).toBe(true);

    const impression = await prisma.adImpression.findUnique({ where: { id: ad.impressionId } });
    const entries = await prisma.developerEarningsLedger.findMany({
      where: { impressionEventId: impression!.eventId },
    });
    expect(entries.length).toBe(1);
  });

  it("does not pay out a view shorter than the minimum qualifying duration", async () => {
    if (!dbAvailable) return;

    const selectRes = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: {
        context: { developerId: devId, command: "npm", language: "typescript", elapsedSeconds: 30 },
      },
    });
    const ad = selectRes.json().ad;

    await app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: {
        eventId: randomUUID(),
        type: "VIEW_COMPLETE",
        campaignId,
        impressionId: ad.impressionId,
        developerId: devId,
        viewDurationMs: 200, // below MIN_VIEW_DURATION_MS default of 1500
      },
    });

    const impression = await prisma.adImpression.findUnique({ where: { id: ad.impressionId } });
    const ledgerEntry = await prisma.developerEarningsLedger.findUnique({
      where: { impressionEventId: impression!.eventId },
    });
    expect(ledgerEntry).toBeNull();
  });
});
