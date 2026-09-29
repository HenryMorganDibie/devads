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

// Every campaign in this file is restricted to LOCAL_AGENT so offer selection
// (which is global over APPROVED sponsorship campaigns) can't pick up
// campaigns from other test files running in parallel against the same DB.
const CLIENT = "LOCAL_AGENT";
const advertiserId = "test-spons-advertiser";
const campaignId = "test-spons-campaign";
const offerId = "test-spons-offer";
const campaign2Id = "test-spons-campaign-2";
const offer2Id = "test-spons-offer-2";
const userA = "test-spons-user-a";
const devA = "test-spons-developer-a";
const userB = "test-spons-user-b";
const devB = "test-spons-developer-b";
const REWARD_UNITS = 40;
const CHARGE_CENTS = 100;

const tokenFor = (userId: string) => signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET);
const authHeader = (userId: string) => ({ authorization: `Bearer ${tokenFor(userId)}` });

const baseCampaign = {
  advertiserId,
  name: "Sponsorship Rewards Test Campaign",
  sponsorCategory: null,
  objective: "QUALIFIED_ENGAGEMENT" as const,
  rewardType: "AI_CREDITS" as const,
  rewardAmountUnits: REWARD_UNITS,
  sponsorChargeCents: CHARGE_CENTS,
  currency: "USD",
  totalBudgetCents: null,
  dailyBudgetCents: null,
  developerDailyCap: null,
  developerLifetimeCap: null,
  frequencyCapPerDay: 1000,
  eligibleClientTypes: [CLIENT] as Array<"LOCAL_AGENT">,
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: null,
  status: "APPROVED" as const,
  spendCarryMilliCents: 0,
};

async function setCampaign(data: Prisma.SponsorshipCampaignUpdateInput, id = campaignId) {
  await prisma.sponsorshipCampaign.update({ where: { id }, data });
}

beforeEach(async () => {
  if (!dbAvailable) return;
  const devs = [devA, devB];
  await prisma.developerRewardLedger.deleteMany({ where: { developerId: { in: devs } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: { in: devs } } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId: { in: [campaignId, campaign2Id] } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { developerId: { in: devs } } });
  await prisma.developmentSession.deleteMany({ where: { developerId: { in: devs } } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Sponsorship Rewards Test Advertiser (DEMO)" },
  });
  await prisma.sponsorshipCampaign.upsert({
    where: { id: campaignId },
    update: baseCampaign,
    create: { id: campaignId, ...baseCampaign },
  });
  const offerData = {
    title: "Try the thing",
    description: "Complete the quickstart",
    ctaUrl: "https://example.com/quickstart",
    requiredAction: "Finish the quickstart",
    expiresAt: null,
    status: "ACTIVE" as const,
  };
  await prisma.sponsoredOffer.upsert({
    where: { id: offerId },
    update: offerData,
    create: { id: offerId, campaignId, ...offerData },
  });
  // Second campaign with a different reward type, parked in DRAFT unless a test needs it.
  const second = { ...baseCampaign, name: "Second", rewardType: "API_CREDITS" as const, rewardAmountUnits: 7, status: "DRAFT" as const };
  await prisma.sponsorshipCampaign.upsert({
    where: { id: campaign2Id },
    update: second,
    create: { id: campaign2Id, ...second },
  });
  await prisma.sponsoredOffer.upsert({
    where: { id: offer2Id },
    update: offerData,
    create: { id: offer2Id, campaignId: campaign2Id, ...offerData },
  });

  for (const [userId, devId] of [
    [userA, devA],
    [userB, devB],
  ]) {
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
    });
    await prisma.developerProfile.upsert({
      where: { id: devId },
      update: { adsEnabled: true, categoriesOptOut: [] },
      create: { id: devId, userId },
    });
  }
});

async function requestOffer(userId = userA, query = `clientType=${CLIENT}`) {
  const res = await app.inject({ method: "GET", url: `/api/v1/sponsorships/offer?${query}`, headers: authHeader(userId) });
  return { status: res.statusCode, offer: res.json().offer as any };
}

async function report(
  displayEventId: string,
  type = "OFFER_COMPLETED",
  opts: { userId?: string; eventId?: string; extra?: Record<string, unknown> } = {}
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/sponsorships/events",
    headers: authHeader(opts.userId ?? userA),
    payload: { eventId: opts.eventId ?? randomUUID(), type, displayEventId, ...(opts.extra ?? {}) },
  });
  return { status: res.statusCode, body: res.json() };
}

const ledgerRows = (developerId = devA) => prisma.developerRewardLedger.findMany({ where: { developerId } });
const spendTotal = async () =>
  (await prisma.sponsorshipCampaignSpend.aggregate({ where: { campaignId }, _sum: { amountCents: true } }))._sum
    .amountCents ?? 0;

describe("sponsorship reward creation", () => {
  it("awards the campaign-configured reward exactly once for a valid completion", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    expect(offer?.offerId).toBe(offerId);
    expect(offer.rewardAmountUnits).toBe(REWARD_UNITS);

    const res = await report(offer.displayEventId);
    expect(res.status).toBe(200);
    expect(res.body.rewarded).toBe(true);
    expect(res.body.reward).toEqual({ rewardType: "AI_CREDITS", amountUnits: REWARD_UNITS, status: "APPROVED" });

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountUnits: REWARD_UNITS, entryType: "EARNED", status: "APPROVED", campaignId });
    expect(rows[0].sponsorshipEventId).toBe(offer.displayEventId);

    const wallet = await prisma.developerRewardWallet.findUnique({
      where: { developerId_rewardType: { developerId: devA, rewardType: "AI_CREDITS" } },
    });
    expect(wallet?.availableUnits).toBe(REWARD_UNITS);
    expect(await spendTotal()).toBe(CHARGE_CENTS);
  });

  it("does not duplicate the ledger entry when the same eventId is retried", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const eventId = randomUUID();

    const first = await report(offer.displayEventId, "OFFER_COMPLETED", { eventId });
    const second = await report(offer.displayEventId, "OFFER_COMPLETED", { eventId });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);

    expect(await ledgerRows()).toHaveLength(1);
    expect(await spendTotal()).toBe(CHARGE_CENTS);
    const wallet = await prisma.developerRewardWallet.findFirst({ where: { developerId: devA } });
    expect(wallet?.availableUnits).toBe(REWARD_UNITS);
  });

  it("does not double-reward the same display under a different completion eventId", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    await report(offer.displayEventId);
    const again = await report(offer.displayEventId);
    expect(again.status).toBe(200);
    expect(again.body.idempotent).toBe(true);
    expect(await ledgerRows()).toHaveLength(1);
  });

  it("rejects completion for a campaign that was paused after display", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    await setCampaign({ status: "PAUSED" });
    const res = await report(offer.displayEventId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("campaign_not_active");
    expect(await ledgerRows()).toHaveLength(0);
    expect(await spendTotal()).toBe(0);
  });

  it("rejects completion for an expired offer", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    await prisma.sponsoredOffer.update({ where: { id: offerId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await report(offer.displayEventId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("offer_expired");
    expect(await ledgerRows()).toHaveLength(0);
  });

  it("rejects completion for a campaign past its end date", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    await setCampaign({ endDate: new Date(Date.now() - 1000) });
    const res = await report(offer.displayEventId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("campaign_ended");
    expect(await ledgerRows()).toHaveLength(0);
  });

  it("rejects completion referencing another developer's display", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer(userA);
    const res = await report(offer.displayEventId, "OFFER_COMPLETED", { userId: userB });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("display_mismatch");
    expect(await ledgerRows(devB)).toHaveLength(0);
  });

  it("rejects a completion referencing a non-existent display", async () => {
    if (!dbAvailable) return;
    const res = await report(randomUUID());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("display_mismatch");
  });

  it("ignores a client-supplied reward amount and uses the campaign-configured value", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const res = await report(offer.displayEventId, "OFFER_COMPLETED", {
      extra: {
        rewardAmountUnits: 999999,
        amountUnits: 999999,
        rewardType: "CASH",
        sponsorChargeCents: 0,
        metadata: { rewardAmountUnits: 999999, amountUnits: 999999 },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.reward.amountUnits).toBe(REWARD_UNITS);
    expect(res.body.reward.rewardType).toBe("AI_CREDITS");

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].amountUnits).toBe(REWARD_UNITS);
    expect(rows[0].rewardType).toBe("AI_CREDITS");
    expect(await spendTotal()).toBe(CHARGE_CENTS);
  });

  it("records non-completion interactions without any economic effect", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    for (const type of ["OFFER_OPENED", "OFFER_INTERACTED", "OFFER_SKIPPED"]) {
      expect((await report(offer.displayEventId, type)).status).toBe(200);
    }
    expect(await ledgerRows()).toHaveLength(0);
    expect(await spendTotal()).toBe(0);
    expect(await prisma.sponsorshipEvent.count({ where: { developerId: devA } })).toBe(4); // 1 display + 3 interactions
  });

  it("does not let clients report OFFER_DISPLAYED themselves", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const res = await report(offer.displayEventId, "OFFER_DISPLAYED");
    expect(res.status).toBe(400);
  });
});

describe("sponsorship campaign limits", () => {
  it("stops charging once the daily budget is exhausted, never overcharging the sponsor (soft cap)", async () => {
    if (!dbAvailable) return;
    await setCampaign({ dailyBudgetCents: 250 }); // room for exactly 2 completions at $1.00

    for (let i = 0; i < 2; i++) {
      const { offer } = await requestOffer();
      expect((await report(offer.displayEventId)).status).toBe(200);
    }
    // Selection-time pre-check stops serving the campaign once its own
    // budget read reflects the first 2 charges.
    const third = await requestOffer();
    expect(third.offer).toBeNull();

    expect(await spendTotal()).toBe(200);
    expect(await spendTotal()).toBeLessThanOrEqual(250);
  });

  it("never overcharges the budget when completions race, while still rewarding every completion", async () => {
    if (!dbAvailable) return;
    await setCampaign({ dailyBudgetCents: 250 });

    // All 5 displays are served before any charge exists, reproducing the
    // race: each looked affordable at selection time.
    const offers = await Promise.all(Array.from({ length: 5 }, () => requestOffer()));
    const displayIds = offers.map((o) => o.offer?.displayEventId).filter(Boolean) as string[];
    expect(displayIds).toHaveLength(5);

    const results = await Promise.all(displayIds.map((id) => report(id)));
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Soft cap: the sponsor is never charged past budget...
    expect(await spendTotal()).toBeLessThanOrEqual(250);
    // ...but the developer's genuine completions are all rewarded; the
    // platform absorbs the race-condition overage, as in the ad system.
    expect(await ledgerRows()).toHaveLength(5);
  });

  it("enforces the developer daily cap", async () => {
    if (!dbAvailable) return;
    await setCampaign({ developerDailyCap: 2 });
    const offers = await Promise.all(Array.from({ length: 3 }, () => requestOffer()));
    const statuses: number[] = [];
    const errors: string[] = [];
    for (const o of offers) {
      const r = await report(o.offer.displayEventId);
      statuses.push(r.status);
      if (r.body.error) errors.push(r.body.error);
    }
    expect(statuses).toEqual([200, 200, 409]);
    expect(errors).toEqual(["developer_daily_cap_reached"]);
    expect(await ledgerRows()).toHaveLength(2);

    // And the capped campaign is no longer offered to this developer.
    expect((await requestOffer()).offer).toBeNull();
  });

  it("enforces the developer lifetime cap", async () => {
    if (!dbAvailable) return;
    await setCampaign({ developerLifetimeCap: 1 });
    const [a, b] = await Promise.all([requestOffer(), requestOffer()]);
    expect((await report(a.offer.displayEventId)).status).toBe(200);
    const second = await report(b.offer.displayEventId);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("developer_lifetime_cap_reached");
    expect(await ledgerRows()).toHaveLength(1);
  });

  it("does not over-award when completions for the same developer race concurrently", async () => {
    if (!dbAvailable) return;
    await setCampaign({ developerDailyCap: 2 });
    const offers = await Promise.all(Array.from({ length: 6 }, () => requestOffer()));
    const results = await Promise.all(offers.map((o) => report(o.offer.displayEventId)));

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 409, 409, 409, 409]);
    expect(await ledgerRows()).toHaveLength(2);
    const wallet = await prisma.developerRewardWallet.findFirst({ where: { developerId: devA } });
    expect(wallet?.availableUnits).toBe(2 * REWARD_UNITS);
  });

  it("applies the per-campaign display frequency cap", async () => {
    if (!dbAvailable) return;
    await setCampaign({ frequencyCapPerDay: 2 });
    expect((await requestOffer()).offer).not.toBeNull();
    expect((await requestOffer()).offer).not.toBeNull();
    expect((await requestOffer()).offer).toBeNull();
  });

  it("only serves campaigns eligible for the requesting client type", async () => {
    if (!dbAvailable) return;
    expect((await requestOffer(userA, "clientType=AIDER")).offer).toBeNull();
    expect((await requestOffer(userA, `clientType=${CLIENT}`)).offer).not.toBeNull();
  });

  it("never serves developers who have opted out", async () => {
    if (!dbAvailable) return;
    await prisma.developerProfile.update({ where: { id: devA }, data: { adsEnabled: false } });
    expect((await requestOffer()).offer).toBeNull();
  });
});

describe("reward wallet", () => {
  it("reports balances that match the ledger sum, per reward type", async () => {
    if (!dbAvailable) return;
    for (let i = 0; i < 2; i++) {
      const { offer } = await requestOffer();
      await report(offer.displayEventId);
    }
    // Switch to the second campaign (different reward type) and earn once.
    await setCampaign({ status: "PAUSED" });
    await setCampaign({ status: "APPROVED" }, campaign2Id);
    const { offer } = await requestOffer();
    expect(offer.campaignId).toBe(campaign2Id);
    await report(offer.displayEventId);

    const res = await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devA}`, headers: authHeader(userA) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ai = body.balances.find((b: any) => b.rewardType === "AI_CREDITS");
    const api = body.balances.find((b: any) => b.rewardType === "API_CREDITS");
    expect(ai).toEqual({ rewardType: "AI_CREDITS", availableUnits: 80, pendingUnits: 0, ledgerAvailableUnits: 80 });
    expect(api).toEqual({ rewardType: "API_CREDITS", availableUnits: 7, pendingUnits: 0, ledgerAvailableUnits: 7 });
    expect(body.recentLedger).toHaveLength(3);

    const ledgerSum = await prisma.developerRewardLedger.aggregate({
      where: { developerId: devA, rewardType: "AI_CREDITS" },
      _sum: { amountUnits: true },
    });
    expect(ai.availableUnits).toBe(ledgerSum._sum.amountUnits);
    // Internal fields are never exposed.
    expect(JSON.stringify(body)).not.toContain("spendCarryMilliCents");
  });

  it("rejects reading another developer's wallet", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devA}`, headers: authHeader(userB) });
    expect(res.statusCode).toBe(403);
  });

  it("rejects wallet reads with no session and 404s unknown developers", async () => {
    if (!dbAvailable) return;
    expect((await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devA}` })).statusCode).toBe(401);
    const res = await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=nope-${randomUUID()}`, headers: authHeader(userA) });
    expect(res.statusCode).toBe(404);
  });
});

describe("development sessions", () => {
  it("starts and ends a session, uses its client type for offers, and enforces ownership", async () => {
    if (!dbAvailable) return;
    const start = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: authHeader(userA),
      payload: { clientType: CLIENT, clientVersion: "1.2.3", activityCategory: "build" },
    });
    expect(start.statusCode).toBe(200);
    const session = start.json();
    expect(session.status).toBe("ACTIVE");

    // Session's clientType is authoritative over the query string.
    const withSession = await requestOffer(userA, `sessionId=${session.id}&clientType=AIDER`);
    expect(withSession.offer).not.toBeNull();
    const display = await prisma.sponsorshipEvent.findUnique({ where: { eventId: withSession.offer.displayEventId } });
    expect(display?.sessionId).toBe(session.id);

    // Another developer can neither use nor end this session.
    expect((await requestOffer(userB, `sessionId=${session.id}`)).status).toBe(403);
    const hostileEnd = await app.inject({ method: "POST", url: `/api/v1/sessions/${session.id}/end`, headers: authHeader(userB) });
    expect(hostileEnd.statusCode).toBe(403);

    const end = await app.inject({ method: "POST", url: `/api/v1/sessions/${session.id}/end`, headers: authHeader(userA) });
    expect(end.statusCode).toBe(200);
    expect(end.json().status).toBe("ENDED");
    expect(end.json().endedAt).toBeTruthy();

    expect((await requestOffer(userA, `sessionId=${session.id}`)).status).toBe(409);
  });

  it("rejects free-text activity descriptions", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: authHeader(userA),
      payload: { clientType: CLIENT, activityCategory: "editing /home/me/secret-project/main.rs" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("sponsorship loop safety", () => {
  it("stops serving a campaign once its total budget is spent", async () => {
    if (!dbAvailable) return;
    await setCampaign({ totalBudgetCents: 2 * CHARGE_CENTS });

    for (let i = 0; i < 2; i++) {
      const { offer } = await requestOffer();
      expect(offer?.offerId).toBe(offerId);
      expect((await report(offer.displayEventId)).status).toBe(200);
    }
    expect((await requestOffer()).offer).toBeNull();
    expect(await spendTotal()).toBe(2 * CHARGE_CENTS);
    expect(await ledgerRows()).toHaveLength(2);
  });

  it("rejects a completion that references a non-display event as its display", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const openedEventId = randomUUID();
    expect((await report(offer.displayEventId, "OFFER_OPENED", { eventId: openedEventId })).status).toBe(200);

    // A client pointing a completion at its own OPENED event instead of the
    // server-issued display must not qualify for a reward.
    const res = await report(openedEventId);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("display_mismatch");
    expect(await ledgerRows()).toHaveLength(0);
    expect(await spendTotal()).toBe(0);
  });

  it("refuses every step of the loop without a session and writes nothing", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const eventsBefore = await prisma.sponsorshipEvent.count({ where: { developerId: devA } });

    const calls = [
      app.inject({ method: "POST", url: "/api/v1/sessions", payload: { clientType: CLIENT } }),
      app.inject({ method: "GET", url: `/api/v1/sponsorships/offer?clientType=${CLIENT}` }),
      app.inject({
        method: "POST",
        url: "/api/v1/sponsorships/events",
        payload: { eventId: randomUUID(), type: "OFFER_COMPLETED", displayEventId: offer.displayEventId },
      }),
      app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devA}` }),
    ];
    for (const res of await Promise.all(calls)) expect(res.statusCode).toBe(401);

    expect(await prisma.sponsorshipEvent.count({ where: { developerId: devA } })).toBe(eventsBefore);
    expect(await ledgerRows()).toHaveLength(0);
    expect(await spendTotal()).toBe(0);
  });

  it("rejects a forged or tampered session token", async () => {
    if (!dbAvailable) return;
    const { offer } = await requestOffer();
    const forged = signSession({ sub: userA, role: "DEVELOPER" }, "not-the-server-secret-but-32-chars-long!!");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sponsorships/events",
      headers: { authorization: `Bearer ${forged}` },
      payload: { eventId: randomUUID(), type: "OFFER_COMPLETED", displayEventId: offer.displayEventId },
    });
    expect(res.statusCode).toBe(401);
    expect(await ledgerRows()).toHaveLength(0);
  });

  it("keeps the sponsor charge, developer reward and wallet consistent across a mixed run", async () => {
    if (!dbAvailable) return;
    // Two developers, retries and a skip: charges and rewards must match
    // completions one-to-one, and every wallet must equal its ledger.
    const completed: string[] = [];
    for (const userId of [userA, userB, userA]) {
      const { offer } = await requestOffer(userId);
      const eventId = randomUUID();
      expect((await report(offer.displayEventId, "OFFER_COMPLETED", { userId, eventId })).status).toBe(200);
      expect((await report(offer.displayEventId, "OFFER_COMPLETED", { userId, eventId })).status).toBe(200); // retry
      completed.push(offer.displayEventId);
    }
    const skipped = (await requestOffer(userB)).offer;
    expect((await report(skipped.displayEventId, "OFFER_SKIPPED", { userId: userB })).status).toBe(200);

    expect(await spendTotal()).toBe(completed.length * CHARGE_CENTS);
    for (const [developerId, count] of [
      [devA, 2],
      [devB, 1],
    ] as const) {
      const rows = await ledgerRows(developerId);
      expect(rows).toHaveLength(count);
      const wallet = await prisma.developerRewardWallet.findUniqueOrThrow({
        where: { developerId_rewardType: { developerId, rewardType: "AI_CREDITS" } },
      });
      expect(wallet.availableUnits).toBe(count * REWARD_UNITS);
      expect(rows.reduce((sum, r) => sum + r.amountUnits, 0)).toBe(wallet.availableUnits);
    }
  });
});
