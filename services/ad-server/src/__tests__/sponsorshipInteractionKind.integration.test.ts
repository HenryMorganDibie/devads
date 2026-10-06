import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import {
  DevAdsClient,
  DevelopmentSessionManager,
  SponsoredOfferRuntime,
  type AdapterHost,
  type FetchLike,
} from "@devads/ad-sdk";
import { buildApp } from "../app.js";

/**
 * Qualifying interaction kinds, against the real server and database.
 *
 * The offer request carries an optional interactionKind (default WAIT,
 * the only kind any production client sent before kinds existed). The
 * server records it on the OFFER_DISPLAYED event and copies it onto every
 * later event for that display; a client cannot relabel a display through
 * the events route. The kind is descriptive only: selection, caps and
 * rewards are identical for every kind.
 */

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

// Restricted to a client type no other test file or seed uses, so offer
// selection here and in test files running in parallel against the same
// database can't pick up each other's campaigns.
const CLIENT = "CLAUDE_CODE" as const;
const advertiserId = "test-ikind-advertiser";
const campaignId = "test-ikind-campaign";
const offerId = "test-ikind-offer";
const userId = "test-ikind-user";
const developerId = "test-ikind-developer";
const REWARD_UNITS = 4;

const campaign = {
  advertiserId,
  name: "Interaction Kind Test Campaign",
  objective: "PRODUCT_DISCOVERY" as const,
  rewardType: "TOOL_CREDITS" as const,
  rewardAmountUnits: REWARD_UNITS,
  sponsorChargeCents: 100,
  currency: "USD",
  totalBudgetCents: 100_000,
  dailyBudgetCents: null,
  developerDailyCap: null,
  developerLifetimeCap: null,
  frequencyCapPerDay: 1000,
  eligibleClientTypes: [CLIENT],
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: null,
  status: "APPROVED" as const,
  spendCarryMilliCents: 0,
};

const auth = () => ({ authorization: `Bearer ${signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET)}` });

function requestOffer(query: string) {
  return app.inject({ method: "GET", url: `/api/v1/sponsorships/offer?${query}`, headers: auth() });
}

function postEvent(body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/v1/sponsorships/events", headers: auth(), payload: body });
}

const eventsFor = (displayEventId: string) =>
  prisma.sponsorshipEvent.findMany({
    where: { OR: [{ eventId: displayEventId }, { displayEventId }] },
    orderBy: { createdAt: "asc" },
  });

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.developerRewardLedger.deleteMany({ where: { developerId } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId } });
  await prisma.sponsorshipEvent.deleteMany({ where: { developerId } });
  await prisma.developmentSession.deleteMany({ where: { developerId } });

  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: {},
    create: { id: advertiserId, name: "Interaction Kind Test Sponsor (DEMO)" },
  });
  await prisma.sponsorshipCampaign.upsert({ where: { id: campaignId }, update: campaign, create: { id: campaignId, ...campaign } });
  const offer = {
    title: "Try the CLI",
    description: "A sponsored developer tool",
    ctaUrl: "https://tool.example/try",
    requiredAction: null,
    expiresAt: null,
    status: "ACTIVE" as const,
  };
  await prisma.sponsoredOffer.upsert({ where: { id: offerId }, update: offer, create: { id: offerId, campaignId, ...offer } });
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: developerId },
    update: { adsEnabled: true, categoriesOptOut: [] },
    create: { id: developerId, userId },
  });
});

describe("qualifying interaction kind on offer requests and events", () => {
  it("records WAIT when the request carries no kind, and later events inherit it", async () => {
    if (!dbAvailable) return;
    const res = await requestOffer(`clientType=${CLIENT}`);
    expect(res.statusCode).toBe(200);
    const { offer } = res.json();
    expect(offer.offerId).toBe(offerId);

    const opened = await postEvent({ eventId: randomUUID(), type: "OFFER_OPENED", displayEventId: offer.displayEventId });
    expect(opened.statusCode).toBe(200);

    const events = await eventsFor(offer.displayEventId);
    expect(events.map((e) => [e.type, e.interactionKind])).toEqual([
      ["OFFER_DISPLAYED", "WAIT"],
      ["OFFER_OPENED", "WAIT"],
    ]);
  });

  it("records an explicit kind on the display and every event for it; a client-sent event kind is ignored", async () => {
    if (!dbAvailable) return;
    const { offer } = (await requestOffer(`clientType=${CLIENT}&interactionKind=DEVELOPER_INITIATED`)).json();

    // The events route has no interactionKind field: this value is stripped.
    const opened = await postEvent({
      eventId: randomUUID(),
      type: "OFFER_OPENED",
      displayEventId: offer.displayEventId,
      interactionKind: "OTHER",
    });
    expect(opened.statusCode).toBe(200);
    const completed = await postEvent({
      eventId: randomUUID(),
      type: "OFFER_COMPLETED",
      displayEventId: offer.displayEventId,
      interactionKind: "WAIT",
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ ok: true, rewarded: true, reward: { amountUnits: REWARD_UNITS } });

    const events = await eventsFor(offer.displayEventId);
    expect(events.map((e) => [e.type, e.interactionKind])).toEqual([
      ["OFFER_DISPLAYED", "DEVELOPER_INITIATED"],
      ["OFFER_OPENED", "DEVELOPER_INITIATED"],
      ["OFFER_COMPLETED", "DEVELOPER_INITIATED"],
    ]);
  });

  it("records the OTHER placeholder kind as given", async () => {
    if (!dbAvailable) return;
    const { offer } = (await requestOffer(`clientType=${CLIENT}&interactionKind=OTHER`)).json();
    const display = await prisma.sponsorshipEvent.findUniqueOrThrow({ where: { eventId: offer.displayEventId } });
    expect(display.interactionKind).toBe("OTHER");
  });

  it("rejects an unknown kind with 400 and records nothing", async () => {
    if (!dbAvailable) return;
    for (const kind of ["BUILD_COMPLETE", "wait", ""]) {
      const res = await requestOffer(`clientType=${CLIENT}&interactionKind=${encodeURIComponent(kind)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_request");
    }
    expect(await prisma.sponsorshipEvent.count({ where: { developerId } })).toBe(0);
  });

  it("does not change selection or the served offer", async () => {
    if (!dbAvailable) return;
    const served: Array<Record<string, unknown>> = [];
    for (const query of ["", "&interactionKind=WAIT", "&interactionKind=DEVELOPER_INITIATED", "&interactionKind=OTHER"]) {
      const { offer } = (await requestOffer(`clientType=${CLIENT}${query}`)).json();
      const { displayEventId: _d, ...rest } = offer;
      served.push(rest);
    }
    expect(served.every((o) => JSON.stringify(o) === JSON.stringify(served[0]))).toBe(true);
    expect(served[0]).toMatchObject({ offerId, rewardAmountUnits: REWARD_UNITS });
  });

  it("events for a display recorded before kinds existed keep a null kind and still work", async () => {
    if (!dbAvailable) return;
    const displayEventId = randomUUID();
    await prisma.sponsorshipEvent.create({
      data: { eventId: displayEventId, type: "OFFER_DISPLAYED", offerId, campaignId, developerId, metadata: { clientType: CLIENT } },
    });
    const completed = await postEvent({ eventId: randomUUID(), type: "OFFER_COMPLETED", displayEventId });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ rewarded: true });
    const events = await eventsFor(displayEventId);
    expect(events.map((e) => [e.type, e.interactionKind])).toEqual([
      ["OFFER_DISPLAYED", null],
      ["OFFER_COMPLETED", null],
    ]);
  });
});

describe("the SDK adapter runtime tags the interaction kind end to end", () => {
  const injectFetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    const res = await app.inject({
      method: init.method as "GET" | "POST",
      url: u.pathname + u.search,
      headers: init.headers,
      payload: init.body,
    });
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => res.json() };
  };

  function runtime() {
    const client = new DevAdsClient({
      baseUrl: "http://devads.internal",
      credentials: { token: signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET), developerId },
      clientType: CLIENT,
      fetch: injectFetch,
    });
    const host: AdapterHost = { presentOffer: () => {}, dismissOffer: () => {}, openExternal: async () => true };
    const session = new DevelopmentSessionManager(() => client);
    return new SponsoredOfferRuntime({ getClient: () => client, session, host });
  }

  it.each([
    ["a QualifyingInteraction of kind WAIT", (r: SponsoredOfferRuntime) => r.offerDuring({ kind: "WAIT", isActive: () => true }), "WAIT"],
    ["a legacy WaitHandle", (r: SponsoredOfferRuntime) => r.offerDuringWait({ isActive: () => true }), "WAIT"],
    [
      "a DEVELOPER_INITIATED interaction",
      (r: SponsoredOfferRuntime) => r.offerDuring({ kind: "DEVELOPER_INITIATED", isActive: () => true }),
      "DEVELOPER_INITIATED",
    ],
  ] as const)("records %s on the display and its completion", async (_label, start, expected) => {
    if (!dbAvailable) return;
    const r = runtime();
    await start(r);
    const offer = r.getCurrent();
    expect(offer?.offerId).toBe(offerId);
    await r.open();

    const events = await eventsFor(offer!.displayEventId);
    expect(events.map((e) => e.type)).toEqual(["OFFER_DISPLAYED", "OFFER_OPENED", "OFFER_COMPLETED"]);
    expect(new Set(events.map((e) => e.interactionKind))).toEqual(new Set([expected]));
  });
});
