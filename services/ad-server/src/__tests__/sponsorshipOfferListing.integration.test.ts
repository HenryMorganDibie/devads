import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@devads/database";
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

// Campaigns in this file are restricted to CUSTOM_AGENT (and one to CURSOR)
// so they never collide with other sponsorship test files sharing the DB,
// and assertions only look at this file's own campaign ids because the
// listing is global over APPROVED campaigns.
const CLIENT = "CUSTOM_AGENT";
const OTHER_CLIENT = "CURSOR";
const advertiserId = "test-listing-advertiser";
const userId = "test-listing-user";
const devId = "test-listing-developer";
const P = "test-listing-";

const tokenFor = (sub: string) => signSession({ sub, role: "DEVELOPER" }, SESSION_SECRET);
const authHeader = (sub = userId) => ({ authorization: `Bearer ${tokenFor(sub)}` });

const PAST = new Date("2026-01-01T00:00:00Z");
const FAR_PAST_END = new Date("2026-02-01T00:00:00Z");
const FUTURE = new Date("2099-01-01T00:00:00Z");

type CampaignSpec = {
  key: string;
  overrides?: Record<string, unknown>;
  offer?: Record<string, unknown>;
};

// live-*       -> listed
// everything else is excluded for exactly one reason.
const SPECS: CampaignSpec[] = [
  { key: "live-ai" },
  { key: "live-api", overrides: { rewardType: "API_CREDITS", rewardAmountUnits: 7, frequencyCapPerDay: 1 } },
  { key: "draft", overrides: { status: "DRAFT" } },
  { key: "submitted", overrides: { status: "SUBMITTED" } },
  { key: "paused", overrides: { status: "PAUSED" } },
  { key: "rejected", overrides: { status: "REJECTED" } },
  { key: "ended", overrides: { endDate: FAR_PAST_END } },
  { key: "not-started", overrides: { startDate: FUTURE } },
  { key: "offer-expired", offer: { expiresAt: new Date("2026-01-15T00:00:00Z") } },
  { key: "offer-inactive", offer: { status: "INACTIVE" } },
  { key: "budget-exhausted", overrides: { totalBudgetCents: 100 } },
  { key: "reward-capped", overrides: { developerLifetimeCap: 1 } },
  { key: "other-client", overrides: { eligibleClientTypes: [OTHER_CLIENT] } },
  { key: "opted-out-category", overrides: { sponsorCategory: "listing-test-category" } },
];
const cid = (key: string) => `${P}campaign-${key}`;
const oid = (key: string) => `${P}offer-${key}`;
const ALL_CAMPAIGN_IDS = SPECS.map((s) => cid(s.key));

function baseCampaign(key: string) {
  return {
    advertiserId,
    name: `Listing Test ${key}`,
    sponsorCategory: null as string | null,
    objective: "PRODUCT_DISCOVERY" as const,
    rewardType: "AI_CREDITS" as const,
    rewardAmountUnits: 40,
    sponsorChargeCents: 100,
    currency: "USD",
    totalBudgetCents: null as number | null,
    dailyBudgetCents: null,
    developerDailyCap: null,
    developerLifetimeCap: null as number | null,
    frequencyCapPerDay: 1000,
    eligibleClientTypes: [CLIENT] as string[],
    startDate: PAST,
    endDate: null as Date | null,
    status: "APPROVED" as const,
    spendCarryMilliCents: 0,
  };
}

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.developerRewardLedger.deleteMany({ where: { campaignId: { in: ALL_CAMPAIGN_IDS } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: devId } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId: { in: ALL_CAMPAIGN_IDS } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { campaignId: { in: ALL_CAMPAIGN_IDS } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { developerId: devId } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Listing Test Advertiser (DEMO)" },
  });

  for (const spec of SPECS) {
    const data = { ...baseCampaign(spec.key), ...(spec.overrides ?? {}) } as Omit<
      Prisma.SponsorshipCampaignUncheckedCreateInput,
      "id"
    >;
    await prisma.sponsorshipCampaign.upsert({
      where: { id: cid(spec.key) },
      update: data,
      create: { id: cid(spec.key), ...data },
    });
    const offerData = {
      title: `Offer ${spec.key}`,
      description: "Try it out",
      ctaUrl: `https://example.com/${spec.key}`,
      requiredAction: null,
      expiresAt: null as Date | null,
      status: "ACTIVE" as const,
      ...(spec.offer ?? {}),
    } as Omit<Prisma.SponsoredOfferUncheckedCreateInput, "id" | "campaignId">;
    await prisma.sponsoredOffer.upsert({
      where: { id: oid(spec.key) },
      update: offerData,
      create: { id: oid(spec.key), campaignId: cid(spec.key), ...offerData },
    });
  }

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: devId },
    update: { adsEnabled: true, categoriesOptOut: ["Listing-Test-Category"] },
    create: { id: devId, userId, adsEnabled: true, categoriesOptOut: ["Listing-Test-Category"] },
  });

  // Fixture state (not written by the route under test): the budget-exhausted
  // campaign has already spent its whole budget, and the reward-capped
  // campaign already rewarded this developer up to its lifetime cap.
  await prisma.sponsorshipCampaignSpend.create({
    data: { campaignId: cid("budget-exhausted"), amountCents: 100, currency: "USD", reason: "SPONSORSHIP_COMPLETION" },
  });
  await prisma.developerRewardLedger.create({
    data: {
      developerId: devId,
      rewardType: "AI_CREDITS",
      campaignId: cid("reward-capped"),
      entryType: "EARNED",
      amountUnits: 40,
      status: "APPROVED",
    },
  });
});

async function listOffers(query = `clientType=${CLIENT}`, sub = userId) {
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/sponsorships/offers${query ? `?${query}` : ""}`,
    headers: authHeader(sub),
  });
  return { status: res.statusCode, body: res.json() as any };
}

/** Only this file's campaigns, since the listing is global over APPROVED campaigns. */
const ours = (offers: Array<{ campaignId: string }>) =>
  offers.filter((o) => ALL_CAMPAIGN_IDS.includes(o.campaignId)).map((o) => o.campaignId).sort();

/** Every table/column the selection and completion paths write to, scoped to this file's rows. */
async function sideEffectSnapshot() {
  const [events, devEvents, spend, spendSum, ledger, wallets, campaigns] = await Promise.all([
    prisma.sponsorshipEvent.count({ where: { campaignId: { in: ALL_CAMPAIGN_IDS } } }),
    prisma.sponsorshipEvent.count({ where: { developerId: devId } }),
    prisma.sponsorshipCampaignSpend.count({ where: { campaignId: { in: ALL_CAMPAIGN_IDS } } }),
    prisma.sponsorshipCampaignSpend.aggregate({
      where: { campaignId: { in: ALL_CAMPAIGN_IDS } },
      _sum: { amountCents: true },
    }),
    prisma.developerRewardLedger.count({ where: { developerId: devId } }),
    prisma.developerRewardWallet.count({ where: { developerId: devId } }),
    prisma.sponsorshipCampaign.findMany({
      where: { id: { in: ALL_CAMPAIGN_IDS } },
      select: { id: true, spendCarryMilliCents: true, updatedAt: true, status: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return { events, devEvents, spend, spendSum: spendSum._sum.amountCents ?? 0, ledger, wallets, campaigns };
}

describe("GET /api/v1/sponsorships/offers (read-only listing)", () => {
  it("requires a session", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({ method: "GET", url: `/api/v1/sponsorships/offers?clientType=${CLIENT}` });
    expect(res.statusCode).toBe(401);
  });

  it("returns multiple eligible APPROVED, live offers and excludes every ineligible one", async () => {
    if (!dbAvailable) return;
    const { status, body } = await listOffers();
    expect(status).toBe(200);
    expect(body.sponsoredContentEnabled).toBe(true);
    expect(ours(body.offers)).toEqual([cid("live-ai"), cid("live-api")]);

    const ai = body.offers.find((o: any) => o.campaignId === cid("live-ai"));
    expect(ai).toEqual({
      offerId: oid("live-ai"),
      campaignId: cid("live-ai"),
      title: "Offer live-ai",
      description: "Try it out",
      ctaUrl: "https://example.com/live-ai",
      requiredAction: null,
      rewardType: "AI_CREDITS",
      rewardAmountUnits: 40,
      expiresAt: null,
      eligibleClientTypes: [CLIENT],
    });
    const api = body.offers.find((o: any) => o.campaignId === cid("live-api"));
    expect(api).toMatchObject({ rewardType: "API_CREDITS", rewardAmountUnits: 7 });

    // Nothing that could be reported/completed, and no sponsor economics.
    for (const o of body.offers) {
      expect(o).not.toHaveProperty("displayEventId");
      expect(o).not.toHaveProperty("sponsorChargeCents");
      expect(o).not.toHaveProperty("totalBudgetCents");
      expect(Number.isInteger(o.rewardAmountUnits)).toBe(true);
    }
  });

  it("applies client-type eligibility only when a clientType is given", async () => {
    if (!dbAvailable) return;
    const other = await listOffers(`clientType=${OTHER_CLIENT}`);
    expect(ours(other.body.offers)).toEqual([cid("other-client")]);

    const unfiltered = await listOffers("");
    expect(unfiltered.status).toBe(200);
    expect(ours(unfiltered.body.offers)).toEqual([cid("live-ai"), cid("live-api"), cid("other-client")].sort());
    const otherOffer = unfiltered.body.offers.find((o: any) => o.campaignId === cid("other-client"));
    expect(otherOffer.eligibleClientTypes).toEqual([OTHER_CLIENT]);
  });

  it("returns an empty list, flagged as opted out, for a developer with sponsored content off", async () => {
    if (!dbAvailable) return;
    await prisma.developerProfile.update({ where: { id: devId }, data: { adsEnabled: false } });
    const { status, body } = await listOffers();
    expect(status).toBe(200);
    expect(body).toEqual({ sponsoredContentEnabled: false, offers: [] });
  });

  it("rejects an unknown clientType", async () => {
    if (!dbAvailable) return;
    const { status, body } = await listOffers("clientType=NOT_A_CLIENT");
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("records no SponsorshipEvent and changes no spend, cap, ledger, wallet or campaign row", async () => {
    if (!dbAvailable) return;
    const before = await sideEffectSnapshot();
    expect(before.events).toBe(0);

    for (let i = 0; i < 5; i++) {
      expect((await listOffers()).status).toBe(200);
      expect((await listOffers("")).status).toBe(200);
    }

    const after = await sideEffectSnapshot();
    expect(after).toEqual(before);
    expect(after.events).toBe(0);
    expect(after.devEvents).toBe(0);
    expect(after.spend).toBe(1); // the budget-exhausted fixture row only
    expect(after.spendSum).toBe(100);
  });

  it("does not consume the display frequency cap used by the selection endpoint", async () => {
    if (!dbAvailable) return;
    // live-api has frequencyCapPerDay = 1. Park live-ai so selection can only pick live-api.
    await prisma.sponsorshipCampaign.update({ where: { id: cid("live-ai") }, data: { status: "PAUSED" } });

    for (let i = 0; i < 3; i++) {
      expect(ours((await listOffers()).body.offers)).toEqual([cid("live-api")]);
    }
    expect(await prisma.sponsorshipEvent.count({ where: { developerId: devId } })).toBe(0);

    // The one allowed display today is still available after repeated listing.
    const served = await app.inject({
      method: "GET",
      url: `/api/v1/sponsorships/offer?clientType=${CLIENT}`,
      headers: authHeader(),
    });
    expect(served.statusCode).toBe(200);
    expect(served.json().offer?.campaignId).toBe(cid("live-api"));
    expect(
      await prisma.sponsorshipEvent.count({ where: { developerId: devId, type: "OFFER_DISPLAYED" } })
    ).toBe(1);

    // Listing still shows the offer after the cap is spent (listing is not a
    // display), while selection now correctly refuses a second display.
    expect(ours((await listOffers()).body.offers)).toEqual([cid("live-api")]);
    const again = await app.inject({
      method: "GET",
      url: `/api/v1/sponsorships/offer?clientType=${CLIENT}`,
      headers: authHeader(),
    });
    expect(again.json().offer).toBeNull();
  });

  it("returns 404 for a session user with no developer profile", async () => {
    if (!dbAvailable) return;
    const { status, body } = await listOffers(`clientType=${CLIENT}`, `no-such-user-${randomUUID()}`);
    expect(status).toBe(404);
    expect(body.error).toBe("developer_not_found");
  });
});
