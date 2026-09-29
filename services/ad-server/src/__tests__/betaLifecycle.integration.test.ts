import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { BETA_TERMS_VERSION, createRedemptionProvider } from "@devads/shared";
import { hashPassword } from "@devads/auth";
import { buildApp } from "../app.js";
import type { IdentityVerifier, VerifiedIdentity } from "../lib/identity.js";

/**
 * The developer beta end to end, against a real Postgres:
 * OAuth sign-in -> DevAds developer -> join beta -> opt in -> BETA offer ->
 * opened -> engagement time -> verified completion -> BETA_CREDITS reward ->
 * wallet and history, plus replay, concurrency, exhaustion, opt-out,
 * cross-developer and client-manipulation cases.
 *
 * The beta campaign here targets CODEX purely as an isolation label: offer
 * selection is global over APPROVED campaigns, and no other test file or seed
 * uses that client type. It implies no Codex integration.
 */
const CLIENT = "CODEX" as const;
const PREFIX = "test-beta";
const ADVERTISER = `${PREFIX}-devads`;
const CAMPAIGN = `${PREFIX}-campaign`;
const OFFER = `${PREFIX}-offer`;
const REWARD = 50;
const CHARGE = 7; // above the seeded beta campaign's 1 cent, in case both are ever eligible
const MIN_ENGAGEMENT = 30;

// A fake Supabase: access token -> identity. Anything else is an invalid token.
const identities = new Map<string, VerifiedIdentity>();
const verifier: IdentityVerifier = { verify: async (t) => identities.get(t) ?? null };
const identity = (id: string, overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
  subject: `supabase:${PREFIX}-${id}`,
  email: `${PREFIX}-${id}@example.com`,
  provider: "github",
  displayName: `Beta ${id}`,
  ...overrides,
});

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
    return;
  }
  app = await buildApp({ identityVerifier: verifier, redemptionProvider: createRedemptionProvider("mock") });
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { OR: [{ authSubject: { startsWith: `supabase:${PREFIX}` } }, { email: { startsWith: PREFIX } }] },
    select: { id: true },
  });
  const devs = await prisma.developerProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } });
  const devIds = devs.map((d) => d.id);
  await prisma.rewardRedemption.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.developerRewardLedger.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.developmentSession.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId: CAMPAIGN } });
  await prisma.advertiserMember.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

beforeEach(async () => {
  if (!dbAvailable) return;
  identities.clear();
  await cleanup();
  await prisma.advertiser.upsert({ where: { id: ADVERTISER }, update: {}, create: { id: ADVERTISER, name: "DevAds (test)" } });
  const campaign = {
    advertiserId: ADVERTISER,
    name: "DevAds Developer Beta (test)",
    sponsorCategory: null,
    mode: "BETA" as const,
    objective: "PRODUCT_DISCOVERY" as const,
    rewardType: "BETA_CREDITS" as const,
    rewardAmountUnits: REWARD,
    sponsorChargeCents: CHARGE,
    currency: "USD",
    totalBudgetCents: null,
    dailyBudgetCents: null,
    developerDailyCap: null,
    developerLifetimeCap: null,
    frequencyCapPerDay: 1000,
    minEngagementSeconds: MIN_ENGAGEMENT,
    eligibleClientTypes: [CLIENT],
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: null,
    status: "APPROVED" as const,
    spendCarryMilliCents: 0,
  };
  await prisma.sponsorshipCampaign.upsert({ where: { id: CAMPAIGN }, update: campaign, create: { id: CAMPAIGN, ...campaign } });
  const offer = {
    title: "DevAds Beta Opportunity (test)",
    description: "Test walkthrough",
    ctaUrl: "https://example.com/beta",
    requiredAction: "Read it",
    expiresAt: null,
    status: "ACTIVE" as const,
  };
  await prisma.sponsoredOffer.upsert({ where: { id: OFFER }, update: offer, create: { id: OFFER, campaignId: CAMPAIGN, ...offer } });
});

// --- helpers -----------------------------------------------------------------

type Session = { token: string; userId: string; developerId: string; created: boolean };

// The exchange is rate limited per client address like the password login;
// each simulated sign-in comes from its own address unless one is given.
let nextAddress = 0;
const freshAddress = () => `10.99.${Math.floor(++nextAddress / 250) % 250}.${(nextAddress % 250) + 1}`;

async function exchange(accessToken: string, remoteAddress = freshAddress()) {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/oauth/exchange", payload: { accessToken }, remoteAddress });
  return { status: res.statusCode, body: res.json() };
}

async function signIn(id: string, overrides: Partial<VerifiedIdentity> = {}): Promise<Session> {
  const token = `supabase-access-token-${id}-${randomUUID()}`;
  identities.set(token, identity(id, overrides));
  const res = await exchange(token);
  expect(res.status).toBe(200);
  return res.body;
}

const auth = (s: Session) => ({ authorization: `Bearer ${s.token}` });

async function call(s: Session | null, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: s ? auth(s) : {}, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
}

const joinBeta = (s: Session) => call(s, "POST", "/api/v1/me/beta", { acceptTerms: true, termsVersion: BETA_TERMS_VERSION });
const optIn = (s: Session, enabled = true) =>
  call(s, "PATCH", `/api/v1/developers/${s.developerId}/preferences`, { adsEnabled: enabled });
const requestOffer = (s: Session) => call(s, "GET", `/api/v1/sponsorships/offer?clientType=${CLIENT}`);
const report = (s: Session, displayEventId: string, type: string, eventId: string = randomUUID(), extra = {}) =>
  call(s, "POST", "/api/v1/sponsorships/events", { eventId, type, displayEventId, ...extra });

/** A signed-in beta member who has opted in. */
async function member(id: string) {
  const s = await signIn(id);
  expect((await joinBeta(s)).status).toBe(200);
  expect((await optIn(s)).status).toBe(200);
  return s;
}

/** Record OFFER_OPENED and backdate it past the engagement window (as if the developer spent that long). */
async function openAndEngage(s: Session, displayEventId: string, secondsAgo = MIN_ENGAGEMENT + 5) {
  const openedId = randomUUID();
  expect((await report(s, displayEventId, "OFFER_OPENED", openedId)).status).toBe(200);
  await prisma.sponsorshipEvent.update({
    where: { eventId: openedId },
    data: { createdAt: new Date(Date.now() - secondsAgo * 1000) },
  });
}

const ledger = (developerId: string) => prisma.developerRewardLedger.findMany({ where: { developerId } });
const spendCents = async () =>
  (await prisma.sponsorshipCampaignSpend.aggregate({ where: { campaignId: CAMPAIGN }, _sum: { amountCents: true } }))._sum
    .amountCents ?? 0;

// --- OAuth identity ------------------------------------------------------------

describe("developer beta: OAuth sign-in", () => {
  it("creates a DevAds developer on first sign-in and retrieves the same one afterwards", async () => {
    if (!dbAvailable) return;
    const first = await signIn("alice");
    expect(first.created).toBe(true);
    expect(first.developerId).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: first.userId }, include: { developerProfile: true } });
    expect(user).toMatchObject({ authSubject: `supabase:${PREFIX}-alice`, role: "DEVELOPER", passwordHash: null });
    // Sponsorships stay off until the developer opts in; not a beta member yet.
    expect(user.developerProfile).toMatchObject({ adsEnabled: false, betaJoinedAt: null, displayName: "Beta alice" });

    const again = await signIn("alice");
    expect(again).toMatchObject({ created: false, userId: first.userId, developerId: first.developerId });
    expect(await prisma.user.count({ where: { authSubject: `supabase:${PREFIX}-alice` } })).toBe(1);
  });

  it("rejects invalid tokens, disallowed providers, missing emails and malformed requests", async () => {
    if (!dbAvailable) return;
    expect((await exchange("not-a-real-supabase-token-at-all")).status).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/oauth/exchange", payload: {} })).statusCode).toBe(400);

    identities.set("token-email-provider-xxxxxxxx", identity("mallory", { provider: "email" }));
    expect((await exchange("token-email-provider-xxxxxxxx")).body.error).toBe("oauth_provider_not_allowed");
    identities.set("token-no-email-xxxxxxxxxxxxxx", identity("noemail", { email: null }));
    expect((await exchange("token-no-email-xxxxxxxxxxxxxx")).body.error).toBe("oauth_email_required");
    expect(await prisma.user.count({ where: { authSubject: { startsWith: `supabase:${PREFIX}` } } })).toBe(0);
  });

  it("never links an OAuth identity to an existing account by email", async () => {
    if (!dbAvailable) return;
    const email = `${PREFIX}-victim@example.com`;
    await prisma.user.create({
      data: { email, passwordHash: hashPassword("correct horse battery"), role: "DEVELOPER", developerProfile: { create: {} } },
    });
    identities.set("token-attacker-same-email-xx", identity("attacker", { email }));
    const res = await exchange("token-attacker-same-email-xx");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("email_in_use_by_another_account");
    expect(await prisma.user.findFirst({ where: { authSubject: `supabase:${PREFIX}-attacker` } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).authSubject).toBeNull();
  });

  it("creates exactly one account when the same identity signs in concurrently", async () => {
    if (!dbAvailable) return;
    const token = "token-concurrent-first-sign-in";
    identities.set(token, identity("racer"));
    const results = await Promise.all(Array.from({ length: 5 }, () => exchange(token)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.developerId)).size).toBe(1);
    expect(await prisma.user.count({ where: { authSubject: `supabase:${PREFIX}-racer` } })).toBe(1);
  });

  it("is rate limited per client like the password login", async () => {
    if (!dbAvailable) return;
    const address = "10.250.0.1";
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await exchange(`invalid-token-for-rate-limit-${i}`, address)).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("is disabled with a clear error when no identity provider is configured", async () => {
    if (!dbAvailable) return;
    const bare = await buildApp({ identityVerifier: null });
    const res = await bare.inject({ method: "POST", url: "/api/v1/auth/oauth/exchange", payload: { accessToken: "x".repeat(40) } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("oauth_not_configured");
    await bare.close();
  });
});

// --- The beta sponsorship loop ---------------------------------------------------

describe("developer beta: sponsorship loop", () => {
  it("runs sign-in -> join -> opt in -> offer -> engagement -> verified reward -> wallet -> history", async () => {
    if (!dbAvailable) return;
    const s = await signIn("dev");

    // Profile, before joining.
    const me = await call(s, "GET", "/api/v1/me/developer");
    expect(me.body).toMatchObject({ sponsorshipsEnabled: false, betaJoinedAt: null, currentBetaTermsVersion: BETA_TERMS_VERSION });

    // Join the beta (terms version is required and idempotent).
    expect((await call(s, "POST", "/api/v1/me/beta", { acceptTerms: false, termsVersion: BETA_TERMS_VERSION })).status).toBe(400);
    expect((await call(s, "POST", "/api/v1/me/beta", { acceptTerms: true, termsVersion: "1999-01-01" })).status).toBe(400);
    const joined = await joinBeta(s);
    expect(joined.body.betaJoinedAt).toBeTruthy();
    expect((await joinBeta(s)).body.betaJoinedAt).toBe(joined.body.betaJoinedAt);

    // A beta member who has not opted into sponsorships receives nothing.
    expect((await requestOffer(s)).body.offer).toBeNull();
    expect((await optIn(s)).body.adsEnabled).toBe(true);

    // A session from the client, then the offer, labelled as a beta opportunity.
    const session = await call(s, "POST", "/api/v1/sessions", { clientType: CLIENT, clientVersion: "test" });
    expect(session.status).toBe(200);
    const { offer } = (await call(s, "GET", `/api/v1/sponsorships/offer?sessionId=${session.body.id}`)).body;
    expect(offer).toMatchObject({
      campaignId: CAMPAIGN,
      rewardType: "BETA_CREDITS",
      rewardAmountUnits: REWARD,
      campaignMode: "BETA",
      minEngagementSeconds: MIN_ENGAGEMENT,
    });

    // Verification: completing without opening, or too soon, does not qualify.
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED")).body.error).toBe("offer_not_opened");
    expect((await report(s, offer.displayEventId, "OFFER_OPENED")).status).toBe(200);
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED")).body.error).toBe("engagement_too_short");
    expect(await ledger(s.developerId)).toHaveLength(0);

    await openAndEngage(s, offer.displayEventId);
    const done = await report(s, offer.displayEventId, "OFFER_COMPLETED", randomUUID(), { sessionId: session.body.id });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ rewarded: true, reward: { rewardType: "BETA_CREDITS", amountUnits: REWARD } });

    // The reward is labelled as DevAds-funded beta, in the reward ledger (not ad earnings).
    const rows = await ledger(s.developerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entryType: "EARNED",
      rewardType: "BETA_CREDITS",
      amountUnits: REWARD,
      rewardSource: "DEVADS_BETA",
      campaignMode: "BETA",
      campaignId: CAMPAIGN,
      sponsorshipEventId: offer.displayEventId,
    });
    expect(await prisma.developerEarningsLedger.count({ where: { developerId: s.developerId } })).toBe(0);

    // Wallet and history.
    const wallet = await call(s, "GET", `/api/v1/wallet?developerId=${s.developerId}`);
    expect(wallet.body.balances).toEqual([
      { rewardType: "BETA_CREDITS", availableUnits: REWARD, pendingUnits: 0, ledgerAvailableUnits: REWARD },
    ]);
    expect(wallet.body.recentLedger[0]).toMatchObject({ rewardSource: "DEVADS_BETA", campaignMode: "BETA" });

    const history = await call(s, "GET", "/api/v1/me/sponsorship-history");
    expect(history.body.events.map((e: any) => e.type)).toEqual(
      expect.arrayContaining(["OFFER_DISPLAYED", "OFFER_OPENED", "OFFER_COMPLETED"])
    );
    expect(history.body.events.every((e: any) => e.campaignMode === "BETA")).toBe(true);

    const sessions = await call(s, "GET", "/api/v1/sessions");
    expect(sessions.body.sessions).toEqual([
      expect.objectContaining({ id: session.body.id, clientType: CLIENT, status: "ACTIVE", interactions: expect.any(Number) }),
    ]);
  });

  it("never serves a beta offer to a developer who has not joined the beta", async () => {
    if (!dbAvailable) return;
    const s = await signIn("outsider");
    expect((await optIn(s)).status).toBe(200);
    expect((await requestOffer(s)).body.offer).toBeNull();
  });

  it("issues the reward exactly once under replays, re-keyed completions and concurrent completions", async () => {
    if (!dbAvailable) return;
    const s = await member("replayer");
    const { offer } = (await requestOffer(s)).body;
    await openAndEngage(s, offer.displayEventId);

    const eventId = randomUUID();
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED", eventId)).body.rewarded).toBe(true);
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED", eventId)).body.idempotent).toBe(true);
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED")).body.idempotent).toBe(true);

    // A second display, completed by many concurrent requests at once.
    const second = (await requestOffer(s)).body.offer;
    await openAndEngage(s, second.displayEventId);
    const burst = await Promise.all(Array.from({ length: 8 }, () => report(s, second.displayEventId, "OFFER_COMPLETED")));
    expect(burst.filter((r) => r.body.rewarded).length).toBe(1);

    expect(await ledger(s.developerId)).toHaveLength(2);
    const wallet = await prisma.developerRewardWallet.findUniqueOrThrow({
      where: { developerId_rewardType: { developerId: s.developerId, rewardType: "BETA_CREDITS" } },
    });
    expect(wallet.availableUnits).toBe(2 * REWARD);
    expect(await spendCents()).toBe(2 * CHARGE);
  });

  it("stops serving the beta campaign once its budget is exhausted", async () => {
    if (!dbAvailable) return;
    await prisma.sponsorshipCampaign.update({ where: { id: CAMPAIGN }, data: { totalBudgetCents: CHARGE } });
    const s = await member("exhaust");
    const { offer } = (await requestOffer(s)).body;
    await openAndEngage(s, offer.displayEventId);
    expect((await report(s, offer.displayEventId, "OFFER_COMPLETED")).body.rewarded).toBe(true);
    expect((await requestOffer(s)).body.offer).toBeNull();
  });

  it("stops serving offers after the developer opts out", async () => {
    if (!dbAvailable) return;
    const s = await member("leaver");
    expect((await requestOffer(s)).body.offer).not.toBeNull();
    expect((await optIn(s, false)).body.adsEnabled).toBe(false);
    expect((await requestOffer(s)).body.offer).toBeNull();
  });

  it("ignores client-supplied reward values and offers no way to write a wallet", async () => {
    if (!dbAvailable) return;
    const s = await member("tamper");
    const { offer } = (await requestOffer(s)).body;
    await openAndEngage(s, offer.displayEventId);
    const res = await report(s, offer.displayEventId, "OFFER_COMPLETED", randomUUID(), {
      rewardAmountUnits: 1_000_000,
      rewardType: "CASH",
      amountUnits: 1_000_000,
    });
    expect(res.body.reward).toEqual({ rewardType: "BETA_CREDITS", amountUnits: REWARD, status: "APPROVED" });

    for (const method of ["POST", "PATCH", "PUT"] as const) {
      const r = await app.inject({ method, url: "/api/v1/wallet", headers: auth(s), payload: { availableUnits: 999999 } });
      expect(r.statusCode).toBe(404);
    }
    const wallet = await call(s, "GET", `/api/v1/wallet?developerId=${s.developerId}`);
    expect(wallet.body.balances[0].availableUnits).toBe(REWARD);
  });

  it("never lets beta credits be redeemed, even with a redemption provider configured", async () => {
    if (!dbAvailable) return;
    const s = await member("redeemer");
    const { offer } = (await requestOffer(s)).body;
    await openAndEngage(s, offer.displayEventId);
    await report(s, offer.displayEventId, "OFFER_COMPLETED");

    const res = await call(s, "POST", "/api/v1/wallet/redemptions", {
      developerId: s.developerId,
      rewardType: "BETA_CREDITS",
      amountUnits: 10,
      idempotencyKey: randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reward_type_not_redeemable");
    expect((await ledger(s.developerId)).filter((r) => r.entryType === "REDEEMED")).toHaveLength(0);
  });
});

// --- Authorization -----------------------------------------------------------------

describe("developer beta: authorization", () => {
  it("refuses unauthenticated and forged-session access to every beta route", async () => {
    if (!dbAvailable) return;
    const forged = { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad", userId: "x", developerId: "x", created: false };
    for (const who of [null, forged]) {
      for (const [method, url] of [
        ["GET", "/api/v1/me/developer"],
        ["POST", "/api/v1/me/beta"],
        ["GET", "/api/v1/sessions"],
        ["GET", "/api/v1/me/sponsorship-history"],
      ] as const) {
        expect((await call(who, method, url, { acceptTerms: true, termsVersion: BETA_TERMS_VERSION })).status, `${method} ${url}`).toBe(401);
      }
    }
  });

  it("keeps each developer's profile, wallet, sessions, history and displays private", async () => {
    if (!dbAvailable) return;
    const a = await member("owner");
    const b = await member("intruder");
    const { offer } = (await requestOffer(a)).body;
    await openAndEngage(a, offer.displayEventId);
    await report(a, offer.displayEventId, "OFFER_COMPLETED");
    await call(a, "POST", "/api/v1/sessions", { clientType: CLIENT });

    expect((await call(b, "GET", "/api/v1/me/developer")).body.developerId).toBe(b.developerId);
    expect((await call(b, "GET", `/api/v1/wallet?developerId=${a.developerId}`)).status).toBe(403);
    expect((await call(b, "PATCH", `/api/v1/developers/${a.developerId}/preferences`, { adsEnabled: false })).status).toBe(403);
    expect((await call(b, "GET", "/api/v1/sessions")).body.sessions).toEqual([]);
    expect((await call(b, "GET", "/api/v1/me/sponsorship-history")).body.events).toEqual([]);

    // B cannot complete A's display, and A's display cannot reward B.
    const bOffer = (await requestOffer(b)).body.offer;
    expect((await report(b, offer.displayEventId, "OFFER_COMPLETED")).status).toBe(400);
    expect(await ledger(b.developerId)).toHaveLength(0);
    expect(bOffer.displayEventId).not.toBe(offer.displayEventId);
  });

  it("does not let a sponsor create a campaign that grants beta credits", async () => {
    if (!dbAvailable) return;
    const sponsor = await prisma.user.create({
      data: { email: `${PREFIX}-sponsor@example.com`, role: "ADVERTISER", passwordHash: hashPassword("sponsor-password-1") },
    });
    await prisma.advertiserMember.create({ data: { advertiserId: ADVERTISER, userId: sponsor.id, role: "OWNER" } });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: sponsor.email, password: "sponsor-password-1" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sponsorship-campaigns",
      headers: { authorization: `Bearer ${login.json().token}` },
      payload: {
        advertiserId: ADVERTISER,
        name: "Sneaky",
        objective: "OTHER",
        rewardType: "BETA_CREDITS",
        rewardAmountUnits: 10,
        sponsorChargeCents: 1,
        mode: "BETA",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma.sponsorshipCampaign.count({ where: { name: "Sneaky" } })).toBe(0);
  });
});

// --- Database guarantees -------------------------------------------------------------

describe("developer beta: database guarantees", () => {
  it("refuses beta credits on a LIVE campaign and non-beta rewards on a BETA campaign", async () => {
    if (!dbAvailable) return;
    await expect(
      prisma.sponsorshipCampaign.update({ where: { id: CAMPAIGN }, data: { mode: "LIVE" } })
    ).rejects.toThrow(/sponsorship_campaigns_beta_reward_type_check/);
    await expect(
      prisma.sponsorshipCampaign.update({ where: { id: CAMPAIGN }, data: { rewardType: "CASH" } })
    ).rejects.toThrow(/sponsorship_campaigns_beta_reward_type_check/);
  });

  it("refuses an earned beta credit that is not labelled as DevAds-funded beta", async () => {
    if (!dbAvailable) return;
    const s = await signIn("labels");
    await expect(
      prisma.developerRewardLedger.create({
        data: {
          developerId: s.developerId,
          rewardType: "BETA_CREDITS",
          campaignId: CAMPAIGN,
          entryType: "EARNED",
          amountUnits: 5,
          status: "APPROVED",
          rewardSource: "SPONSOR",
          campaignMode: "LIVE",
        },
      })
    ).rejects.toThrow(/developer_reward_ledger_beta_source_check/);
  });
});
