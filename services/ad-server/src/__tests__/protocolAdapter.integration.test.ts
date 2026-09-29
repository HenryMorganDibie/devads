import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import {
  DevAdsClient,
  DevelopmentSessionManager,
  SponsoredOfferRuntime,
  type AdapterHost,
  type FetchLike,
  type SponsoredOpportunity,
} from "@devads/ad-sdk";
import { buildApp } from "../app.js";

/**
 * Phase 6 boundary proof, end to end against the real server and database:
 * a hypothetical third-party client, written only against the public SDK
 * (DevAdsClient + the host-agnostic adapter runtime), runs the whole
 * sponsor -> session -> offer -> qualifying action -> sponsor charge ->
 * developer reward -> wallet loop. It uses the OTHER client type because it
 * is not an integration with any real tool; nothing in the server, the
 * reward accounting or the SDK was changed to support it.
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

// Restricted to OTHER so global offer selection can't pick up campaigns from
// other test files running in parallel against the same database.
const CLIENT = "OTHER" as const;
const advertiserId = "test-adapter-advertiser";
const campaignId = "test-adapter-campaign";
const offerId = "test-adapter-offer";
const userId = "test-adapter-user";
const developerId = "test-adapter-developer";
const REWARD_UNITS = 3;
const CHARGE_CENTS = 250;

const campaign = {
  advertiserId,
  name: "Adapter Boundary Test Campaign",
  // A sponsor outside developer tooling, rewarding event access: nothing in
  // the loop depends on sponsor category or on AI credits.
  sponsorCategory: "conference",
  objective: "OTHER" as const,
  rewardType: "OTHER" as const,
  rewardAmountUnits: REWARD_UNITS,
  sponsorChargeCents: CHARGE_CENTS,
  currency: "USD",
  totalBudgetCents: 10_000,
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

/** The SDK's structural fetch, served by the in-process app instead of the network. */
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

/** Hypothetical adapter: implements AdapterHost and reports a wait it can observe. Nothing else. */
class ThirdPartyAdapter {
  readonly shown: SponsoredOpportunity[] = [];
  readonly notices: string[] = [];
  readonly client: DevAdsClient;
  readonly session: DevelopmentSessionManager;
  readonly offers: SponsoredOfferRuntime;
  private waiting = false;

  constructor() {
    const token = signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET);
    this.client = new DevAdsClient({
      baseUrl: "http://devads.internal",
      credentials: { token, developerId },
      clientType: CLIENT,
      clientVersion: "0.0.1-test",
      fetch: injectFetch,
    });
    const host: AdapterHost = {
      presentOffer: (offer) => this.shown.push(offer),
      dismissOffer: () => {},
      openExternal: async () => true,
      notify: (message) => this.notices.push(message),
    };
    this.session = new DevelopmentSessionManager(() => this.client);
    this.offers = new SponsoredOfferRuntime({ getClient: () => this.client, session: this.session, host });
  }

  async waitStarted() {
    this.waiting = true;
    await this.offers.offerDuringWait({ isActive: () => this.waiting });
  }

  waitFinished() {
    this.waiting = false;
    this.offers.waitEnded();
  }
}

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
    create: { id: advertiserId, name: "Adapter Boundary Test Sponsor (DEMO)" },
  });
  await prisma.sponsorshipCampaign.upsert({ where: { id: campaignId }, update: campaign, create: { id: campaignId, ...campaign } });
  const offer = {
    title: "Register for DevConf",
    description: "A sponsored conference ticket",
    ctaUrl: "https://conference.example/register",
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

describe("a third-party protocol adapter against the real server", () => {
  it("runs the full sponsor -> engagement -> reward -> wallet loop with no client-specific server code", async () => {
    if (!dbAvailable) return;
    const adapter = new ThirdPartyAdapter();

    await adapter.waitStarted();
    expect(adapter.shown.map((o) => o.offerId)).toEqual([offerId]);
    const sessionId = adapter.session.currentSessionId();
    expect(sessionId).toBeTruthy();
    const session = await prisma.developmentSession.findUniqueOrThrow({ where: { id: sessionId! } });
    expect(session).toMatchObject({ developerId, clientType: CLIENT, clientVersion: "0.0.1-test", status: "ACTIVE" });

    await adapter.offers.open();
    adapter.waitFinished();
    await adapter.session.end();

    // Developer reward: exactly the campaign-configured amount, once.
    expect(adapter.notices).toEqual(['DevAds: you earned 3 units (other reward) from "Register for DevConf".']);
    const ledger = await prisma.developerRewardLedger.findMany({ where: { developerId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ entryType: "EARNED", amountUnits: REWARD_UNITS, rewardType: "OTHER", status: "APPROVED" });

    // Sponsor charge: the campaign's configured charge, recorded separately from the reward.
    const spend = await prisma.sponsorshipCampaignSpend.aggregate({ where: { campaignId }, _sum: { amountCents: true } });
    expect(spend._sum.amountCents).toBe(CHARGE_CENTS);

    // Wallet, read through the same SDK.
    const wallet = await adapter.client.getWallet();
    expect(wallet.balances).toEqual([
      expect.objectContaining({ rewardType: "OTHER", availableUnits: REWARD_UNITS, ledgerAvailableUnits: REWARD_UNITS }),
    ]);

    // Full, auditable lifecycle for this display, attributed to the adapter's session.
    const events = await prisma.sponsorshipEvent.findMany({ where: { developerId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["OFFER_DISPLAYED", "OFFER_OPENED", "OFFER_COMPLETED"]);
    expect(new Set(events.map((e) => e.sessionId))).toEqual(new Set([sessionId]));
    expect((await prisma.developmentSession.findUniqueOrThrow({ where: { id: sessionId! } })).status).toBe("ENDED");
  });

  it("a replayed completion from the adapter neither re-rewards nor re-charges", async () => {
    if (!dbAvailable) return;
    const adapter = new ThirdPartyAdapter();
    await adapter.waitStarted();
    const [offer] = adapter.shown;
    await adapter.offers.open(offer);

    const replay = await adapter.client.completeQualifyingAction({ displayEventId: offer.displayEventId });
    expect(replay.rewarded ?? false).toBe(false);

    expect(await prisma.developerRewardLedger.count({ where: { developerId } })).toBe(1);
    const spend = await prisma.sponsorshipCampaignSpend.aggregate({ where: { campaignId }, _sum: { amountCents: true } });
    expect(spend._sum.amountCents).toBe(CHARGE_CENTS);
  });

  it("the adapter degrades to no offer when the campaign is not live", async () => {
    if (!dbAvailable) return;
    await prisma.sponsorshipCampaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    const adapter = new ThirdPartyAdapter();
    await adapter.waitStarted();
    expect(adapter.shown).toEqual([]);
    expect(await prisma.developerRewardLedger.count({ where: { developerId } })).toBe(0);
  });
});
