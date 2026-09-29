import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { BETA_TERMS_VERSION } from "@devads/shared";
import { buildApp } from "../app.js";
import type { IdentityVerifier, VerifiedIdentity } from "../lib/identity.js";

/**
 * First-party VIDEO offers end to end against a real Postgres: the wait
 * window picks the creative (never a longer one), the display records which
 * creative was served, and the reward still requires the DevAds-controlled,
 * server-timed qualifying action; presenting or "watching" a video earns
 * nothing by itself.
 *
 * CLAUDE_CODE is used purely as an isolation label (offer selection is
 * global over APPROVED campaigns and no other test or seed uses it). It
 * implies no Claude Code integration.
 */
const CLIENT = "CLAUDE_CODE" as const;
const PREFIX = "test-video";
const ADVERTISER = `${PREFIX}-devads`;
const VIDEO_CAMPAIGN = `${PREFIX}-campaign`;
const VIDEO_OFFER = `${PREFIX}-offer`;
const CARD_CAMPAIGN = `${PREFIX}-card-campaign`;
const CARD_OFFER = `${PREFIX}-card-offer`;
const MIN_ENGAGEMENT = 15;

const identities = new Map<string, VerifiedIdentity>();
const verifier: IdentityVerifier = { verify: async (t) => identities.get(t) ?? null };

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
    return;
  }
  app = await buildApp({ identityVerifier: verifier });
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

const campaignBase = {
  advertiserId: ADVERTISER,
  sponsorCategory: null,
  mode: "BETA" as const,
  objective: "PRODUCT_DISCOVERY" as const,
  rewardType: "BETA_CREDITS" as const,
  rewardAmountUnits: 25,
  sponsorChargeCents: 1,
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

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const devs = await prisma.developerProfile.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { id: true } });
  const devIds = devs.map((d) => d.id);
  await prisma.developerRewardLedger.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.sponsorshipEvent.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.developmentSession.deleteMany({ where: { developerId: { in: devIds } } });
  await prisma.sponsorshipCampaignSpend.deleteMany({ where: { campaignId: { in: [VIDEO_CAMPAIGN, CARD_CAMPAIGN] } } });
  await prisma.sponsorshipCampaign.deleteMany({ where: { id: CARD_CAMPAIGN } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

beforeEach(async () => {
  if (!dbAvailable) return;
  identities.clear();
  await cleanup();
  await prisma.advertiser.upsert({ where: { id: ADVERTISER }, update: {}, create: { id: ADVERTISER, name: "DevAds (test)" } });
  const campaign = { ...campaignBase, name: "DevAds Beta Video (test)" };
  await prisma.sponsorshipCampaign.upsert({ where: { id: VIDEO_CAMPAIGN }, update: campaign, create: { id: VIDEO_CAMPAIGN, ...campaign } });
  const offer = {
    title: "DevAds Beta Opportunity: a product (test)",
    description: "First-party beta video (test)",
    ctaUrl: "https://devads.example/beta/opportunity/product?d={displayEventId}",
    requiredAction: "Open the project page, stay 15 seconds, confirm",
    presentationMode: "VIDEO" as const,
    expiresAt: null,
    status: "ACTIVE" as const,
  };
  await prisma.sponsoredOffer.upsert({ where: { id: VIDEO_OFFER }, update: offer, create: { id: VIDEO_OFFER, campaignId: VIDEO_CAMPAIGN, ...offer } });
  for (const d of [10, 15, 20]) {
    const data = {
      kind: "VIDEO" as const,
      url: `https://devads.example/beta-creatives/product-${d}s.webm`,
      mimeType: "video/webm",
      fallbackUrl: `https://devads.example/beta-creatives/product-${d}s.mp4`,
      fallbackMimeType: "video/mp4",
      posterUrl: `https://devads.example/beta-creatives/product-${d}s.jpg`,
      width: 1280,
      height: 720,
      sha256: "0".repeat(64),
    };
    await prisma.offerCreative.upsert({
      where: { offerId_durationSeconds: { offerId: VIDEO_OFFER, durationSeconds: d } },
      update: data,
      create: { offerId: VIDEO_OFFER, durationSeconds: d, ...data },
    });
  }
});

// --- helpers -------------------------------------------------------------------

type Session = { token: string; userId: string; developerId: string };
let nextAddress = 0;

async function member(id: string): Promise<Session> {
  const token = `supabase-access-token-${id}-${randomUUID()}`;
  identities.set(token, { subject: `supabase:${PREFIX}-${id}-${randomUUID()}`, email: `${PREFIX}-${id}-${randomUUID()}@example.com`, provider: "github", displayName: id });
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/oauth/exchange",
    payload: { accessToken: token },
    remoteAddress: `10.98.${Math.floor(++nextAddress / 250) % 250}.${(nextAddress % 250) + 1}`,
  });
  expect(res.statusCode).toBe(200);
  const s = res.json() as Session;
  expect((await call(s, "POST", "/api/v1/me/beta", { acceptTerms: true, termsVersion: BETA_TERMS_VERSION })).status).toBe(200);
  expect((await call(s, "PATCH", `/api/v1/developers/${s.developerId}/preferences`, { adsEnabled: true })).status).toBe(200);
  return s;
}

async function call(s: Session, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer ${s.token}` }, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
}

const requestOffer = (s: Session, window?: number | string) =>
  call(s, "GET", `/api/v1/sponsorships/offer?clientType=${CLIENT}${window === undefined ? "" : `&availableWaitSeconds=${window}`}`);
const report = (s: Session, displayEventId: string, type: string, eventId: string = randomUUID()) =>
  call(s, "POST", "/api/v1/sponsorships/events", { eventId, type, displayEventId });

// --- tests -----------------------------------------------------------------------

describe("first-party VIDEO offers", () => {
  it("serves no video without a window, or with less than 10 seconds of it", async () => {
    if (!dbAvailable) return;
    const s = await member("nowindow");
    for (const w of [undefined, 0, 9]) expect((await requestOffer(s, w)).body.offer).toBeNull();
    expect(await prisma.sponsorshipEvent.count({ where: { developerId: s.developerId } })).toBe(0);
  });

  it("serves the longest creative that fits and never a longer one", async () => {
    if (!dbAvailable) return;
    const s = await member("windows");
    const served: Array<[number, number]> = [];
    for (const w of [10, 14, 15, 19, 20, 90]) {
      const { body } = await requestOffer(s, w);
      expect(body.offer.presentationMode).toBe("VIDEO");
      expect(body.offer.campaignMode).toBe("BETA");
      expect(body.offer.creative.durationSeconds).toBeLessThanOrEqual(w);
      served.push([w, body.offer.creative.durationSeconds]);
    }
    expect(served).toEqual([[10, 10], [14, 10], [15, 15], [19, 15], [20, 20], [90, 20]]);
  });

  it("records which creative each display served, and resolves the CTA to this display", async () => {
    if (!dbAvailable) return;
    const s = await member("audit");
    const { body } = await requestOffer(s, 17);
    const display = await prisma.sponsorshipEvent.findUniqueOrThrow({
      where: { eventId: body.offer.displayEventId },
      include: { creative: true },
    });
    expect(display.type).toBe("OFFER_DISPLAYED");
    expect(display.creative?.durationSeconds).toBe(15);
    expect(display.metadata).toMatchObject({ availableWaitSeconds: 17, creativeDurationSeconds: 15 });
    expect(body.offer.ctaUrl).toBe(`https://devads.example/beta/opportunity/product?d=${body.offer.displayEventId}`);
    expect(body.offer.creative).toMatchObject({
      url: "https://devads.example/beta-creatives/product-15s.webm",
      mimeType: "video/webm",
      fallback: { url: "https://devads.example/beta-creatives/product-15s.mp4", mimeType: "video/mp4" },
    });
  });

  it("rewards only the DevAds-controlled qualifying action, verified from server time, never the video itself", async () => {
    if (!dbAvailable) return;
    const s = await member("reward");
    const { body } = await requestOffer(s, 20);
    const d = body.offer.displayEventId;

    // Presenting the video (and any interaction the client reports) is not the qualifying action.
    expect((await report(s, d, "OFFER_INTERACTED")).status).toBe(200);
    expect((await report(s, d, "OFFER_COMPLETED")).body.error).toBe("offer_not_opened");

    // Opening the DevAds product page starts the server-side engagement clock.
    const openedId = randomUUID();
    expect((await report(s, d, "OFFER_OPENED", openedId)).status).toBe(200);
    expect((await report(s, d, "OFFER_COMPLETED")).body.error).toBe("engagement_too_short");

    await prisma.sponsorshipEvent.update({ where: { eventId: openedId }, data: { createdAt: new Date(Date.now() - (MIN_ENGAGEMENT + 2) * 1000) } });
    const done = await report(s, d, "OFFER_COMPLETED");
    expect(done.status).toBe(200);
    expect(done.body.reward).toEqual({ rewardType: "BETA_CREDITS", amountUnits: 25, status: "APPROVED" });

    const rows = await prisma.developerRewardLedger.findMany({ where: { developerId: s.developerId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rewardSource: "DEVADS_BETA", campaignMode: "BETA", rewardType: "BETA_CREDITS", amountUnits: 25 });
  });

  it("yields to a CARD offer when the window is too short for any video", async () => {
    if (!dbAvailable) return;
    const card = { ...campaignBase, name: "Card (test)", minEngagementSeconds: null };
    await prisma.sponsorshipCampaign.create({ data: { id: CARD_CAMPAIGN, ...card } });
    await prisma.sponsoredOffer.create({
      data: { id: CARD_OFFER, campaignId: CARD_CAMPAIGN, title: "Card (test)", description: "x", ctaUrl: "https://devads.example/card", requiredAction: null, status: "ACTIVE" },
    });
    const s = await member("yield");
    const short = await requestOffer(s, 6);
    expect(short.body.offer).toMatchObject({ offerId: CARD_OFFER, presentationMode: "CARD", creative: null });
  });

  it("rejects malformed wait windows", async () => {
    if (!dbAvailable) return;
    const s = await member("bad");
    for (const w of ["-1", "3601", "abc", "1.5"]) expect((await requestOffer(s, w)).status).toBe(400);
  });

  it("enforces creative integrity in the database", async () => {
    if (!dbAvailable) return;
    const bad = (over: Record<string, unknown>) =>
      prisma.offerCreative.create({
        data: { offerId: VIDEO_OFFER, kind: "VIDEO", url: "https://x.example/v.mp4", mimeType: "video/mp4", durationSeconds: 30, width: 1280, height: 720, ...over },
      });
    await expect(bad({ durationSeconds: 0 })).rejects.toThrow(/offer_creatives_duration_check/);
    await expect(bad({ url: "javascript:alert(1)" })).rejects.toThrow(/offer_creatives_url_check/);
    await expect(bad({ mimeType: "text/html" })).rejects.toThrow(/offer_creatives_video_mime_check/);
    await expect(bad({ width: 0 })).rejects.toThrow(/offer_creatives_dimensions_check/);
    await expect(bad({ fallbackUrl: "https://x.example/v.webm" })).rejects.toThrow(/offer_creatives_fallback_check/);
  });
});
