import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import { buildApp } from "../app.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

/**
 * Regression test for the per-impression flooring bug: a $15 CPM campaign
 * costs 1.5 cents/impression. The old code did
 * `Math.floor(cpmCents / 1000)` per impression, recording 1 cent every
 * single time and silently losing the other half-cent forever. Over many
 * impressions that's a real, compounding understatement of what the
 * advertiser actually owes and what the developer actually earned.
 *
 * The fix (Campaign.spendCarryMilliCents / DeveloperProfile.earningsCarryMilliCents)
 * must make the *sum* of recorded campaign_spend / earnings_ledger rows
 * exactly match the true fractional total once enough impressions have
 * accrued a whole cent -- this test proves that end to end through the
 * real HTTP routes and a real Postgres, not just at the pure-function level
 * (money.test.ts already covers the pure carry math in isolation).
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

const advertiserId = "test-carry-advertiser";
const campaignId = "test-carry-campaign";
const creativeId = "test-carry-creative";
const userId = "test-carry-user";
const devId = "test-carry-developer";
const CPM_CENTS = 1500; // $15 CPM -> 1.5 cents/impression, doesn't divide evenly

const authHeader = () => ({
  authorization: `Bearer ${signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET)}`,
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.developerEarningsLedger.deleteMany({ where: { developerId: devId } });
  await prisma.campaignSpend.deleteMany({ where: { campaignId } });
  await prisma.adEvent.deleteMany({ where: { developerId: devId } });
  await prisma.adImpression.deleteMany({ where: { developerId: devId } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Carry Precision Test Advertiser (DEMO)" },
  });
  await prisma.campaign.upsert({
    where: { id: campaignId },
    update: { status: "APPROVED", cpmCents: CPM_CENTS, spendCarryMilliCents: 0 },
    create: {
      id: campaignId,
      advertiserId,
      name: "Carry Precision Test Campaign",
      status: "APPROVED",
      isDemo: true,
      cpmCents: CPM_CENTS,
      currency: "USD",
      // A distinctive, unmatched-by-any-other-fixture language so this
      // campaign is the only eligible candidate regardless of what other
      // higher-CPM fixture campaigns exist in the DB from other test files.
      targets: { create: { languages: ["carry-precision-test-lang"] } },
    },
  });
  await prisma.campaignCreative.upsert({
    where: { id: creativeId },
    update: {},
    create: {
      id: creativeId,
      campaignId,
      type: "IMAGE",
      headline: "Carry Precision Test",
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
    update: { earningsCarryMilliCents: 0, frequencyCapOverride: 1000 },
    create: { id: devId, userId, frequencyCapOverride: 1000 }, // high enough that the default daily cap never interferes with this test's loop
  });
});

describe("carry-based accounting precision", () => {
  it("conserves the exact fractional total spend/earnings across many sub-cent-fraction impressions", async () => {
    if (!dbAvailable) return;

    // Capped at 10: the platform's global daily frequency cap
    // (config.frequencyCap.defaultDailyCapGlobal, default 10) applies per
    // developer across ALL campaigns and is not overridden by
    // frequencyCapOverride (which only raises the per-campaign cap) -- so
    // this test must fit within it. 10 impressions * 1.5 cents/impression
    // = exactly 15 cents true cost, of which 60% (9 cents) is the
    // developer's exact true earnings -- both land on a whole cent with no
    // carry left over, which is what makes this a clean assertion.
    const IMPRESSIONS = 10;

    for (let i = 0; i < IMPRESSIONS; i++) {
      const selectRes = await app.inject({
        method: "POST",
        url: "/api/v1/ads/select",
        headers: authHeader(),
        payload: {
          context: {
            developerId: devId,
            command: "npm",
            language: "carry-precision-test-lang",
            elapsedSeconds: 30,
          },
        },
      });
      const ad = selectRes.json().ad;
      expect(ad).not.toBeNull();
      expect(ad.campaignId).toBe(campaignId);

      const viewRes = await app.inject({
        method: "POST",
        url: "/api/v1/events",
        headers: authHeader(),
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
    }

    const spendTotal = await prisma.campaignSpend.aggregate({
      where: { campaignId },
      _sum: { amountCents: true },
    });
    const earningsTotal = await prisma.developerEarningsLedger.aggregate({
      where: { developerId: devId },
      _sum: { amountCents: true },
    });
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const developer = await prisma.developerProfile.findUniqueOrThrow({ where: { id: devId } });

    // True cost: 10 impressions * 1.5 cents = 15 cents exactly, no carry left.
    // (The old floor()-per-impression code would have recorded 10 * 1 = 10
    // cents here -- a full third understated.)
    expect(spendTotal._sum.amountCents).toBe(15);
    expect(campaign.spendCarryMilliCents).toBe(0);

    // True earnings at the default 60% revshare: 15 cents * 0.6 = 9 cents exactly.
    expect(earningsTotal._sum.amountCents).toBe(9);
    expect(developer.earningsCarryMilliCents).toBe(0);
  });

  it("conserves the exact fractional total when qualified views land concurrently, not just serially", async () => {
    if (!dbAvailable) return;

    // Select all 10 impressions first (serially, so each one is a distinct
    // impression row), then fire all 10 VIEW_COMPLETE events at once --
    // the carry's read-increment-resolve-write sequence must still be
    // exact under concurrent writers to the same campaign/developer rows,
    // not just when called one at a time.
    const impressionIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const selectRes = await app.inject({
        method: "POST",
        url: "/api/v1/ads/select",
        headers: authHeader(),
        payload: {
          context: {
            developerId: devId,
            command: "npm",
            language: "carry-precision-test-lang",
            elapsedSeconds: 30,
          },
        },
      });
      const ad = selectRes.json().ad;
      expect(ad).not.toBeNull();
      impressionIds.push(ad.impressionId);
    }

    await Promise.all(
      impressionIds.map((impressionId) =>
        app.inject({
          method: "POST",
          url: "/api/v1/events",
          headers: authHeader(),
          payload: {
            eventId: randomUUID(),
            type: "VIEW_COMPLETE",
            campaignId,
            impressionId,
            developerId: devId,
            viewDurationMs: 3000,
          },
        })
      )
    );

    const spendTotal = await prisma.campaignSpend.aggregate({
      where: { campaignId },
      _sum: { amountCents: true },
    });
    const earningsTotal = await prisma.developerEarningsLedger.aggregate({
      where: { developerId: devId },
      _sum: { amountCents: true },
    });
    const ledgerCount = await prisma.developerEarningsLedger.count({ where: { developerId: devId } });
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const developer = await prisma.developerProfile.findUniqueOrThrow({ where: { id: devId } });

    expect(spendTotal._sum.amountCents).toBe(15);
    expect(campaign.spendCarryMilliCents).toBe(0);
    expect(earningsTotal._sum.amountCents).toBe(9);
    expect(developer.earningsCarryMilliCents).toBe(0);
    expect(ledgerCount).toBe(10); // exactly one ledger row per impression, none lost or duplicated
  });
});
