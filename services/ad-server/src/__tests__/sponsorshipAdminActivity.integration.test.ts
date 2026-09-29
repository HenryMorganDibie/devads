import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import {
  AdminSponsorshipCampaignDTOSchema,
  AdminSponsorshipEventsPageSchema,
  AdminSponsorshipRewardsPageSchema,
  SponsorshipCampaignDTOSchema,
} from "@devads/shared";
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

// Seeded campaigns are PAUSED/DRAFT so offer selection in other test files
// (global over APPROVED campaigns) never serves them. The one end-to-end test
// uses GEMINI, a client type no other sponsorship test file requests.
const E2E_CLIENT = "GEMINI";
const advertiserId = "test-sponsadmin-advertiser";
const ADVERTISER_NAME = "Admin Activity Test Advertiser (DEMO)";
const ownerUserId = "test-sponsadmin-owner";
const campaignA = "test-sponsadmin-campaign-a";
const campaignB = "test-sponsadmin-campaign-b";
const offerA = "test-sponsadmin-offer-a";
const offerB = "test-sponsadmin-offer-b";
const dev1User = "test-sponsadmin-user-1";
const dev1 = "test-sponsadmin-developer-1";
const dev2User = "test-sponsadmin-user-2";
const dev2 = "test-sponsadmin-developer-2";

const header = (sub: string, role: "DEVELOPER" | "ADVERTISER" | "ADMIN") => ({
  authorization: `Bearer ${signSession({ sub, role }, SESSION_SECRET)}`,
});
const admin = () => header("test-sponsadmin-admin", "ADMIN");
const owner = () => header(ownerUserId, "ADVERTISER");

const baseCampaign = {
  advertiserId,
  objective: "QUALIFIED_ENGAGEMENT" as const,
  rewardType: "TOOL_CREDITS" as const,
  rewardAmountUnits: 15,
  sponsorChargeCents: 250,
  frequencyCapPerDay: 1000,
  eligibleClientTypes: [E2E_CLIENT] as Array<"GEMINI">,
  startDate: new Date("2026-01-01T00:00:00Z"),
};

// Campaign A: 6 displays by dev1 (three sharing one timestamp, to exercise
// the id tie-break), 4 completions by dev1, 1 display by dev2; 4 EARNED
// ledger rows; 2 spend rows. Campaign B: 2 displays + 1 completion by dev2,
// 1 EARNED ledger row. Every event carries metadata that must never be returned.
const T = (s: number) => new Date(Date.UTC(2026, 8, 1, 12, 0, s));
const SECRET_METADATA = { note: "internal-metadata-must-not-leak" };
const LEDGER_DESCRIPTION = "ledger-description-must-not-leak";

const seededA = {
  events: [] as string[],
  displaysDev1: [] as string[],
  completionsDev1: [] as string[],
  ledger: [] as string[],
};
const seededB = { events: [] as string[], ledger: [] as string[] };

async function cleanup() {
  const ids = [campaignA, campaignB];
  await prisma.developerRewardLedger.deleteMany({ where: { campaign: { advertiserId } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: { in: [dev1, dev2] } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { campaign: { advertiserId } } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.sponsorshipCampaign.deleteMany({ where: { advertiserId, id: { notIn: ids } } });
}

async function event(campaignId: string, offerId: string, developerId: string, type: string, at: Date, displayEventId: string | null = null) {
  const eventId = `test-sponsadmin-evt-${randomUUID()}`;
  await prisma.sponsorshipEvent.create({
    data: {
      eventId,
      type: type as "OFFER_DISPLAYED",
      offerId,
      campaignId,
      developerId,
      sessionId: null,
      displayEventId,
      metadata: SECRET_METADATA,
      createdAt: at,
    },
  });
  return eventId;
}

async function ledger(campaignId: string, developerId: string, sponsorshipEventId: string, at: Date) {
  const row = await prisma.developerRewardLedger.create({
    data: {
      developerId,
      rewardType: "TOOL_CREDITS",
      campaignId,
      sponsorshipEventId,
      entryType: "EARNED",
      amountUnits: 15,
      status: "APPROVED",
      description: LEDGER_DESCRIPTION,
      createdAt: at,
    },
  });
  return row.id;
}

beforeEach(async () => {
  if (!dbAvailable) return;
  await cleanup();

  for (const [id, role] of [
    [ownerUserId, "ADVERTISER"],
    [dev1User, "DEVELOPER"],
    [dev2User, "DEVELOPER"],
  ] as const) {
    await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.com`, role } });
  }
  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: { name: ADVERTISER_NAME, status: "ACTIVE" },
    create: { id: advertiserId, name: ADVERTISER_NAME, status: "ACTIVE" },
  });
  await prisma.advertiserMember.upsert({
    where: { advertiserId_userId: { advertiserId, userId: ownerUserId } },
    update: {},
    create: { advertiserId, userId: ownerUserId, role: "OWNER" },
  });
  for (const [devId, userId] of [
    [dev1, dev1User],
    [dev2, dev2User],
  ]) {
    await prisma.developerProfile.upsert({
      where: { id: devId },
      update: { adsEnabled: true, categoriesOptOut: [] },
      create: { id: devId, userId },
    });
  }

  for (const [id, name, status] of [
    [campaignA, "Admin Activity Campaign A", "PAUSED"],
    [campaignB, "Admin Activity Campaign B", "DRAFT"],
  ] as const) {
    const data = { ...baseCampaign, name, status };
    await prisma.sponsorshipCampaign.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  const offerData = { title: "Try it", description: "Run the quickstart", ctaUrl: "https://example.com/q", status: "ACTIVE" as const };
  await prisma.sponsoredOffer.upsert({ where: { id: offerA }, update: offerData, create: { id: offerA, campaignId: campaignA, ...offerData } });
  await prisma.sponsoredOffer.upsert({ where: { id: offerB }, update: offerData, create: { id: offerB, campaignId: campaignB, ...offerData } });

  seededA.events = [];
  seededA.displaysDev1 = [];
  seededA.completionsDev1 = [];
  seededA.ledger = [];
  seededB.events = [];
  seededB.ledger = [];

  const displayTimes = [T(1), T(2), T(2), T(2), T(3), T(4)];
  for (const at of displayTimes) seededA.displaysDev1.push(await event(campaignA, offerA, dev1, "OFFER_DISPLAYED", at));
  for (let i = 0; i < 4; i++) {
    const display = seededA.displaysDev1[i];
    const at = new Date(T(5).getTime() + i);
    seededA.completionsDev1.push(await event(campaignA, offerA, dev1, "OFFER_COMPLETED", at, display));
    seededA.ledger.push(await ledger(campaignA, dev1, display, at));
  }
  const dev2Display = await event(campaignA, offerA, dev2, "OFFER_DISPLAYED", T(6));
  seededA.events = [...seededA.displaysDev1, ...seededA.completionsDev1, dev2Display];
  await prisma.sponsorshipCampaignSpend.createMany({
    data: [
      { campaignId: campaignA, amountCents: 250 },
      { campaignId: campaignA, amountCents: 250 },
    ],
  });

  const bDisplay1 = await event(campaignB, offerB, dev2, "OFFER_DISPLAYED", T(1));
  const bDisplay2 = await event(campaignB, offerB, dev2, "OFFER_DISPLAYED", T(2));
  const bCompletion = await event(campaignB, offerB, dev2, "OFFER_COMPLETED", T(3), bDisplay1);
  seededB.events = [bDisplay1, bDisplay2, bCompletion];
  seededB.ledger.push(await ledger(campaignB, dev2, bDisplay1, T(3)));
});

async function get(url: string, headers: Record<string, string> = admin()) {
  const res = await app.inject({ method: "GET", url, headers });
  return { status: res.statusCode, body: res.json(), raw: res.body };
}

/** Walks every page with the given page size and returns all items plus the page count. */
async function walk(path: string, limit: number, extra = "") {
  const items: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const qs = `limit=${limit}${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const { status, body } = await get(`${path}?${qs}`);
    expect(status).toBe(200);
    expect(body.items.length).toBeLessThanOrEqual(limit);
    items.push(...body.items);
    cursor = body.nextCursor;
    pages++;
    expect(pages).toBeLessThan(50);
  } while (cursor);
  return { items, pages };
}

const eventsPath = (id: string) => `/api/v1/admin/sponsorship-campaigns/${id}/events`;
const rewardsPath = (id: string) => `/api/v1/admin/sponsorship-campaigns/${id}/rewards`;

describe("admin sponsorship activity: access control", () => {
  it("rejects non-admin and anonymous callers with 403 on every new and enriched admin read route", async () => {
    if (!dbAvailable) return;
    const urls = [eventsPath(campaignA), rewardsPath(campaignA), "/api/v1/admin/sponsorship-campaigns"];
    for (const url of urls) {
      expect((await get(url, header(dev1User, "DEVELOPER"))).status).toBe(403);
      expect((await get(url, owner())).status).toBe(403);
      expect((await get(url, {})).status).toBe(403);
    }
  });

  it("404s an unknown campaign and 400s bad paging input", async () => {
    if (!dbAvailable) return;
    expect((await get(eventsPath("no-such-campaign"))).body).toEqual({ error: "campaign_not_found" });
    expect((await get(rewardsPath("no-such-campaign"))).status).toBe(404);
    expect((await get(`${eventsPath(campaignA)}?limit=0`)).status).toBe(400);
    expect((await get(`${eventsPath(campaignA)}?limit=201`)).status).toBe(400);
    expect((await get(`${rewardsPath(campaignA)}?limit=abc`)).status).toBe(400);
    expect((await get(`${eventsPath(campaignA)}?type=NOT_A_TYPE`)).status).toBe(400);
    const badCursor = await get(`${eventsPath(campaignA)}?cursor=${Buffer.from("not-a-cursor").toString("base64url")}`);
    expect(badCursor).toMatchObject({ status: 400, body: { error: "invalid_cursor" } });
    expect((await get(`${rewardsPath(campaignA)}?cursor=%21%21%21`)).status).toBe(400);
  });
});

describe("GET /api/v1/admin/sponsorship-campaigns/:id/events", () => {
  it("pages through every event of the campaign, newest first, with no gaps, repeats or other campaigns' rows", async () => {
    if (!dbAvailable) return;
    const all = await get(eventsPath(campaignA));
    expect(all.status).toBe(200);
    expect(AdminSponsorshipEventsPageSchema.safeParse(all.body).success).toBe(true);
    expect(all.body.nextCursor).toBeNull(); // 11 rows < default limit 50
    expect(all.body.items.map((e: any) => e.eventId).sort()).toEqual([...seededA.events].sort());

    // Newest first, ties at the same timestamp still in a total order.
    const times = all.body.items.map((e: any) => e.createdAt);
    expect([...times].sort().reverse()).toEqual(times);

    for (const size of [1, 2, 3, 4]) {
      const { items, pages } = await walk(eventsPath(campaignA), size);
      expect(items.map((e) => e.eventId)).toEqual(all.body.items.map((e: any) => e.eventId));
      expect(new Set(items.map((e) => e.eventId)).size).toBe(seededA.events.length);
      expect(pages).toBe(Math.ceil(seededA.events.length / size));
    }

    const b = await get(eventsPath(campaignB));
    expect(b.body.items.map((e: any) => e.eventId).sort()).toEqual([...seededB.events].sort());
    for (const e of b.body.items) expect(seededA.events).not.toContain(e.eventId);
  });

  it("returns only coarse correlation fields: no metadata, no Prisma internals", async () => {
    if (!dbAvailable) return;
    const { body, raw } = await get(eventsPath(campaignA));
    for (const e of body.items) {
      expect(Object.keys(e).sort()).toEqual(
        ["createdAt", "developerId", "displayEventId", "eventId", "offerId", "sessionId", "type"].sort()
      );
      expect(e.offerId).toBe(offerA);
    }
    expect(raw).not.toContain(SECRET_METADATA.note);
    expect(raw).not.toContain("campaignId");

    // Completions point at the display they claim, which is what replay/abuse review correlates on.
    const completions = body.items.filter((e: any) => e.type === "OFFER_COMPLETED");
    expect(completions.map((e: any) => e.displayEventId).sort()).toEqual(seededA.displaysDev1.slice(0, 4).sort());
    for (const e of body.items.filter((x: any) => x.type === "OFFER_DISPLAYED")) expect(e.displayEventId).toBeNull();
  });

  it("filters by developer and by event type (e.g. one developer's completions)", async () => {
    if (!dbAvailable) return;
    const dev2Only = await get(`${eventsPath(campaignA)}?developerId=${dev2}`);
    expect(dev2Only.body.items).toHaveLength(1);
    expect(dev2Only.body.items[0]).toMatchObject({ developerId: dev2, type: "OFFER_DISPLAYED" });

    const { items } = await walk(eventsPath(campaignA), 3, `&developerId=${dev1}&type=OFFER_COMPLETED`);
    expect(items.map((e) => e.eventId).sort()).toEqual([...seededA.completionsDev1].sort());
    for (const e of items) expect(e).toMatchObject({ developerId: dev1, type: "OFFER_COMPLETED" });

    // A developer filter never crosses campaigns: dev1 has no events on B.
    expect((await get(`${eventsPath(campaignB)}?developerId=${dev1}`)).body).toEqual({ items: [], nextCursor: null });
  });
});

describe("GET /api/v1/admin/sponsorship-campaigns/:id/rewards", () => {
  it("pages through the campaign's ledger rows only", async () => {
    if (!dbAvailable) return;
    const all = await get(rewardsPath(campaignA));
    expect(all.status).toBe(200);
    expect(AdminSponsorshipRewardsPageSchema.safeParse(all.body).success).toBe(true);
    expect(all.body.items.map((r: any) => r.id).sort()).toEqual([...seededA.ledger].sort());

    const { items, pages } = await walk(rewardsPath(campaignA), 3);
    expect(items.map((r) => r.id)).toEqual(all.body.items.map((r: any) => r.id));
    expect(pages).toBe(2);

    const b = await get(rewardsPath(campaignB));
    expect(b.body.items.map((r: any) => r.id)).toEqual(seededB.ledger);
    expect((await get(`${rewardsPath(campaignA)}?developerId=${dev2}`)).body.items).toEqual([]);
  });

  it("returns developer, reward and ledger fields only, never the ledger description", async () => {
    if (!dbAvailable) return;
    const { body, raw } = await get(rewardsPath(campaignA));
    for (const r of body.items) {
      expect(Object.keys(r).sort()).toEqual(
        ["amountUnits", "campaignId", "createdAt", "developerId", "entryType", "id", "rewardType", "sponsorshipEventId", "status"].sort()
      );
      expect(r).toMatchObject({ developerId: dev1, campaignId: campaignA, rewardType: "TOOL_CREDITS", entryType: "EARNED", amountUnits: 15, status: "APPROVED" });
      expect(seededA.displaysDev1).toContain(r.sponsorshipEventId);
    }
    expect(raw).not.toContain(LEDGER_DESCRIPTION);
  });
});

describe("GET /api/v1/admin/sponsorship-campaigns (enriched)", () => {
  it("adds the advertiser name and the same stats the sponsor list route computes", async () => {
    if (!dbAvailable) return;
    const { status, body } = await get("/api/v1/admin/sponsorship-campaigns");
    expect(status).toBe(200);
    const a = body.find((c: any) => c.id === campaignA);
    const b = body.find((c: any) => c.id === campaignB);
    expect(a.advertiserName).toBe(ADVERTISER_NAME);
    expect(a.stats).toEqual({ displays: 7, completions: 4, rewardsGranted: 4, spendCents: 500 });
    expect(b.stats).toEqual({ displays: 2, completions: 1, rewardsGranted: 1, spendCents: 0 });

    const sponsor = await get(`/api/v1/sponsorship-campaigns?advertiserId=${advertiserId}`, owner());
    expect(sponsor.status).toBe(200);
    for (const id of [campaignA, campaignB]) {
      expect(body.find((c: any) => c.id === id).stats).toEqual(sponsor.body.find((c: any) => c.id === id).stats);
    }
    // The sponsor route itself is unchanged: no advertiserName added there.
    for (const c of sponsor.body) expect(c).not.toHaveProperty("advertiserName");
  });

  it("is purely additive: every existing DTO field is still present with the same value", async () => {
    if (!dbAvailable) return;
    const { body } = await get("/api/v1/admin/sponsorship-campaigns?status=PAUSED");
    const a = body.find((c: any) => c.id === campaignA);
    expect(body.every((c: any) => c.status === "PAUSED")).toBe(true);

    // Parses under both the pre-existing DTO schema and the new admin schema.
    expect(SponsorshipCampaignDTOSchema.safeParse(a).success).toBe(true);
    expect(AdminSponsorshipCampaignDTOSchema.safeParse(a).success).toBe(true);
    const previousKeys = Object.keys(SponsorshipCampaignDTOSchema.shape).filter((k) => k !== "stats");
    for (const k of previousKeys) expect(a).toHaveProperty(k);
    expect(Object.keys(a).filter((k) => !previousKeys.includes(k)).sort()).toEqual(["advertiserName", "stats"]);
    expect(a).not.toHaveProperty("spendCarryMilliCents");
    expect(a).not.toHaveProperty("advertiser");

    // Same values as the sponsor route returns for the shared fields.
    const sponsor = (await get(`/api/v1/sponsorship-campaigns?advertiserId=${advertiserId}`, owner())).body;
    const { advertiserName: _name, ...shared } = a;
    expect(shared).toEqual(sponsor.find((c: any) => c.id === campaignA));
  });
});

describe("read-only guarantee", () => {
  it("the admin read routes change no event, ledger, spend, wallet or campaign row", async () => {
    if (!dbAvailable) return;
    const snapshot = async () => ({
      events: await prisma.sponsorshipEvent.count({ where: { campaign: { advertiserId } } }),
      ledger: await prisma.developerRewardLedger.count({ where: { campaign: { advertiserId } } }),
      spend: await prisma.sponsorshipCampaignSpend.count({ where: { campaign: { advertiserId } } }),
      wallets: await prisma.developerRewardWallet.count({ where: { developerId: { in: [dev1, dev2] } } }),
      campaigns: await prisma.sponsorshipCampaign.findMany({
        where: { advertiserId },
        select: { id: true, status: true, updatedAt: true, spendCarryMilliCents: true },
        orderBy: { id: "asc" },
      }),
    });
    const before = await snapshot();
    await get(eventsPath(campaignA));
    await walk(eventsPath(campaignA), 2);
    await get(rewardsPath(campaignA));
    await get("/api/v1/admin/sponsorship-campaigns");
    expect(await snapshot()).toEqual(before);
  });
});

describe("end to end with real selection and completion", () => {
  it("shows the server-recorded display, the completion correlated to it, and the reward it granted", async () => {
    if (!dbAvailable) return;
    const e2eCampaign = await prisma.sponsorshipCampaign.create({
      data: {
        ...baseCampaign,
        name: "Admin Activity E2E",
        status: "APPROVED",
        offers: { create: [{ title: "E2E", description: "Open it", ctaUrl: "https://example.com/e2e" }] },
      },
    });
    try {
      const dev = header(dev1User, "DEVELOPER");
      const served = await app.inject({ method: "GET", url: `/api/v1/sponsorships/offer?clientType=${E2E_CLIENT}`, headers: dev });
      const offer = served.json().offer;
      expect(offer.campaignId).toBe(e2eCampaign.id);
      const completionId = randomUUID();
      const done = await app.inject({
        method: "POST",
        url: "/api/v1/sponsorships/events",
        headers: dev,
        payload: { eventId: completionId, type: "OFFER_COMPLETED", displayEventId: offer.displayEventId, metadata: SECRET_METADATA },
      });
      expect(done.json().rewarded).toBe(true);
    } finally {
      await prisma.sponsorshipCampaign.update({ where: { id: e2eCampaign.id }, data: { status: "PAUSED" } });
    }

    const events = await get(eventsPath(e2eCampaign.id));
    expect(events.raw).not.toContain(SECRET_METADATA.note);
    expect(events.body.items).toHaveLength(2);
    const display = events.body.items.find((e: any) => e.type === "OFFER_DISPLAYED");
    const completion = events.body.items.find((e: any) => e.type === "OFFER_COMPLETED");
    expect(display).toMatchObject({ type: "OFFER_DISPLAYED", developerId: dev1, displayEventId: null });
    expect(completion).toMatchObject({ type: "OFFER_COMPLETED", developerId: dev1, displayEventId: display.eventId });

    const rewards = await get(rewardsPath(e2eCampaign.id));
    expect(rewards.body.items).toHaveLength(1);
    expect(rewards.body.items[0]).toMatchObject({ developerId: dev1, entryType: "EARNED", amountUnits: 15, sponsorshipEventId: display.eventId });

    const list = (await get("/api/v1/admin/sponsorship-campaigns")).body;
    expect(list.find((c: any) => c.id === e2eCampaign.id).stats).toEqual({ displays: 1, completions: 1, rewardsGranted: 1, spendCents: 250 });
  });
});
