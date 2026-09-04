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

const advertiserId = "test-budget-advertiser";
const campaignId = "test-budget-campaign";
const creativeId = "test-budget-creative";
const userId = "test-budget-user";
const devId = "test-budget-developer";
const CPM_CENTS = 100000; // $1000 CPM -> 100 cents ($1.00)/impression, whole cent, no carry noise
const DAILY_BUDGET_CENTS = 250; // room for exactly 2 impressions ($2.00), 3rd must be rejected

const authHeader = () => ({
  authorization: `Bearer ${signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET)}`,
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.campaignSpend.deleteMany({ where: { campaignId } });
  await prisma.developerEarningsLedger.deleteMany({ where: { developerId: devId } });
  await prisma.adEvent.deleteMany({ where: { developerId: devId } });
  await prisma.adImpression.deleteMany({ where: { developerId: devId } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Budget Enforcement Test Advertiser (DEMO)" },
  });
  await prisma.campaign.upsert({
    where: { id: campaignId },
    update: { status: "APPROVED", cpmCents: CPM_CENTS, dailyBudgetCents: DAILY_BUDGET_CENTS, spendCarryMilliCents: 0 },
    create: {
      id: campaignId,
      advertiserId,
      name: "Budget Enforcement Test Campaign",
      status: "APPROVED",
      isDemo: true,
      cpmCents: CPM_CENTS,
      currency: "USD",
      dailyBudgetCents: DAILY_BUDGET_CENTS,
      targets: { create: { languages: ["budget-enforcement-test-lang"] } },
    },
  });
  await prisma.campaignCreative.upsert({
    where: { id: creativeId },
    update: {},
    create: {
      id: creativeId,
      campaignId,
      type: "IMAGE",
      headline: "Budget Enforcement Test",
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
    create: { id: devId, userId, frequencyCapOverride: 1000 },
  });
});

async function requestAdAndQualifiedView(): Promise<{ selectStatus: number; ad: any }> {
  const selectRes = await app.inject({
    method: "POST",
    url: "/api/v1/ads/select",
    headers: authHeader(),
    payload: {
      context: {
        developerId: devId,
        command: "npm",
        language: "budget-enforcement-test-lang",
        elapsedSeconds: 30,
      },
    },
  });
  const ad = selectRes.json().ad;
  if (!ad) return { selectStatus: selectRes.statusCode, ad: null };

  await app.inject({
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
  return { selectStatus: selectRes.statusCode, ad };
}

describe("budget enforcement", () => {
  it("stops charging campaign_spend once the daily budget is exhausted, never overcharging the advertiser", async () => {
    if (!dbAvailable) return;

    // 2 impressions at $1.00 each = $2.00, exactly at the $2.50 daily budget's room for 2.
    await requestAdAndQualifiedView();
    await requestAdAndQualifiedView();
    // A 3rd $1.00 impression would push total to $3.00, over the $2.50
    // budget -- the ad-select pre-check (a fast, best-effort filter, not
    // the authoritative enforcement) correctly stops serving the campaign
    // once its own budget read reflects the first 2 impressions' spend.
    const third = await requestAdAndQualifiedView();
    expect(third.ad).toBeNull();

    const spendTotal = await prisma.campaignSpend.aggregate({
      where: { campaignId },
      _sum: { amountCents: true },
    });
    // The true committed spend must never exceed the budget, regardless of
    // how many qualified views came in -- the 3rd view's spend is absorbed
    // by the platform rather than overcharging the advertiser.
    expect(spendTotal._sum.amountCents ?? 0).toBeLessThanOrEqual(DAILY_BUDGET_CENTS);
    expect(spendTotal._sum.amountCents).toBe(200); // exactly the first 2 impressions' cost
  });

  it("never overcharges the budget even when qualified views for the same campaign race concurrently", async () => {
    if (!dbAvailable) return;

    // Select all 5 impressions CONCURRENTLY so each one's pre-check budget
    // read sees the same stale "$0 spent so far" snapshot and all 5 pass
    // it (the pre-check is best-effort, not authoritative -- see the
    // "stops charging" test above for proof the pre-check alone catches
    // the serial case). This reproduces the actual race: 5 impressions
    // that all looked affordable at select time, whose real cost is only
    // committed later, concurrently, when their qualified views land.
    const selectResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: "POST",
          url: "/api/v1/ads/select",
          headers: authHeader(),
          payload: {
            context: {
              developerId: devId,
              command: "npm",
              language: "budget-enforcement-test-lang",
              elapsedSeconds: 30,
            },
          },
        })
      )
    );
    const impressionIds = selectResults.map((r) => r.json().ad?.impressionId).filter(Boolean) as string[];
    expect(impressionIds.length).toBe(5);

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
    // 5 impressions at $1.00 each would be $5.00, well over the $2.50
    // budget -- true committed spend must stay within budget regardless of
    // how many views landed concurrently.
    expect(spendTotal._sum.amountCents ?? 0).toBeLessThanOrEqual(DAILY_BUDGET_CENTS);
  });
});
