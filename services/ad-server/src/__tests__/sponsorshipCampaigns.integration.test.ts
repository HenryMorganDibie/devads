import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@devads/database";
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

// Campaigns in this file are restricted to OPENCODE so they never collide
// with other sponsorship test files sharing the DB.
const CLIENT = "OPENCODE";
const ownerUserId = "test-sponscamp-owner";
const attackerUserId = "test-sponscamp-attacker";
const advertiserId = "test-sponscamp-advertiser";
const devUserId = "test-sponscamp-dev-user";
const devId = "test-sponscamp-developer";

const header = (sub: string, role: "DEVELOPER" | "ADVERTISER" | "ADMIN") => ({
  authorization: `Bearer ${signSession({ sub, role }, SESSION_SECRET)}`,
});
const owner = () => header(ownerUserId, "ADVERTISER");
const attacker = () => header(attackerUserId, "ADVERTISER");
const admin = () => header("test-sponscamp-admin", "ADMIN");
const developer = () => header(devUserId, "DEVELOPER");

const PROVIDER_NAMES = /claude|anthropic|openai|gpt|codex|google|gemini|cursor|mistral|meta|llama/i;

function newCampaignPayload(overrides: Record<string, unknown> = {}) {
  return {
    advertiserId,
    name: `Sponsor-agnostic campaign ${randomUUID().slice(0, 8)}`,
    objective: "TRIAL_ACTIVATION",
    rewardType: "COMPUTE_CREDITS",
    rewardAmountUnits: 25,
    sponsorChargeCents: 300,
    eligibleClientTypes: [CLIENT],
    offers: [{ title: "Start a trial", description: "Spin up a sandbox", ctaUrl: "https://example.com/trial" }],
    ...overrides,
  };
}

beforeEach(async () => {
  if (!dbAvailable) return;
  // Ledger rows reference campaigns with ON DELETE RESTRICT (money history is
  // never silently deleted), so clear them before removing test campaigns.
  await prisma.developerRewardLedger.deleteMany({ where: { campaign: { advertiserId } } });
  await prisma.developerRewardWallet.deleteMany({ where: { developerId: devId } });
  await prisma.sponsorshipCampaign.deleteMany({ where: { advertiserId } });

  for (const [id, role] of [
    [ownerUserId, "ADVERTISER"],
    [attackerUserId, "ADVERTISER"],
    [devUserId, "DEVELOPER"],
  ] as const) {
    await prisma.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@example.com`, role } });
  }
  await prisma.advertiser.upsert({
    where: { id: advertiserId },
    update: { status: "ACTIVE" },
    create: { id: advertiserId, name: "Sponsorship Campaign Test Advertiser (DEMO)", status: "ACTIVE" },
  });
  await prisma.advertiserMember.upsert({
    where: { advertiserId_userId: { advertiserId, userId: ownerUserId } },
    update: {},
    create: { advertiserId, userId: ownerUserId, role: "OWNER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: devId },
    update: { adsEnabled: true, categoriesOptOut: [] },
    create: { id: devId, userId: devUserId },
  });
});

async function createCampaign(overrides: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/sponsorship-campaigns",
    headers: owner(),
    payload: newCampaignPayload(overrides),
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function submitAndApprove(id: string) {
  expect((await app.inject({ method: "POST", url: `/api/v1/sponsorship-campaigns/${id}/submit`, headers: owner() })).statusCode).toBe(200);
  const approved = await app.inject({ method: "POST", url: `/api/v1/admin/sponsorship-campaigns/${id}/approve`, headers: admin() });
  expect(approved.statusCode).toBe(200);
  return approved.json();
}

async function earnOnce() {
  const offerRes = await app.inject({ method: "GET", url: `/api/v1/sponsorships/offer?clientType=${CLIENT}`, headers: developer() });
  const offer = offerRes.json().offer;
  if (!offer) return { offer: null, completion: null };
  const completion = await app.inject({
    method: "POST",
    url: "/api/v1/sponsorships/events",
    headers: developer(),
    payload: { eventId: randomUUID(), type: "OFFER_COMPLETED", displayEventId: offer.displayEventId },
  });
  return { offer, completion: completion.json() };
}

describe("sponsorship campaign ownership", () => {
  it("rejects creating a sponsorship campaign under an advertiser the caller isn't a member of", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sponsorship-campaigns",
      headers: attacker(),
      payload: newCampaignPayload(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects listing, editing, adding offers to or submitting another advertiser's campaign", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign();
    const list = await app.inject({ method: "GET", url: `/api/v1/sponsorship-campaigns?advertiserId=${advertiserId}`, headers: attacker() });
    const patch = await app.inject({ method: "PATCH", url: `/api/v1/sponsorship-campaigns/${c.id}`, headers: attacker(), payload: { rewardAmountUnits: 1 } });
    const offer = await app.inject({
      method: "POST",
      url: `/api/v1/sponsorship-campaigns/${c.id}/offers`,
      headers: attacker(),
      payload: { title: "x", description: "y", ctaUrl: "https://example.com" },
    });
    const submit = await app.inject({ method: "POST", url: `/api/v1/sponsorship-campaigns/${c.id}/submit`, headers: attacker() });
    expect([list.statusCode, patch.statusCode, offer.statusCode, submit.statusCode]).toEqual([403, 403, 403, 403]);
  });

  it("requires a session for sponsor routes and an admin session for admin routes", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign();
    expect((await app.inject({ method: "GET", url: `/api/v1/sponsorship-campaigns?advertiserId=${advertiserId}` })).statusCode).toBe(401);
    await app.inject({ method: "POST", url: `/api/v1/sponsorship-campaigns/${c.id}/submit`, headers: owner() });
    const asOwner = await app.inject({ method: "POST", url: `/api/v1/admin/sponsorship-campaigns/${c.id}/approve`, headers: owner() });
    expect(asOwner.statusCode).toBe(403);
  });

  it("only allows editing while in DRAFT and never exposes internal carry state", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign();
    expect(c).not.toHaveProperty("spendCarryMilliCents");
    const patched = await app.inject({ method: "PATCH", url: `/api/v1/sponsorship-campaigns/${c.id}`, headers: owner(), payload: { rewardAmountUnits: 30 } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().rewardAmountUnits).toBe(30);
    expect(patched.json().eligibleClientTypes).toEqual([CLIENT]); // partial update didn't reset it

    await submitAndApprove(c.id);
    const late = await app.inject({ method: "PATCH", url: `/api/v1/sponsorship-campaigns/${c.id}`, headers: owner(), payload: { rewardAmountUnits: 99999 } });
    expect(late.statusCode).toBe(409);
  });

  it("requires at least one offer to submit", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign({ offers: [] });
    const res = await app.inject({ method: "POST", url: `/api/v1/sponsorship-campaigns/${c.id}/submit`, headers: owner() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("campaign_needs_at_least_one_offer");
  });
});

describe("sponsorship campaign lifecycle", () => {
  it("DRAFT -> SUBMITTED -> APPROVED serves and rewards; PAUSED stops serving", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign();
    expect(c.status).toBe("DRAFT");
    // Not served until approved.
    expect((await earnOnce()).offer).toBeNull();

    const approved = await submitAndApprove(c.id);
    expect(approved.status).toBe("APPROVED");

    const { offer, completion } = await earnOnce();
    expect(offer.campaignId).toBe(c.id);
    expect(completion.reward).toEqual({ rewardType: "COMPUTE_CREDITS", amountUnits: 25, status: "APPROVED" });

    const list = await app.inject({ method: "GET", url: `/api/v1/sponsorship-campaigns?advertiserId=${advertiserId}`, headers: owner() });
    expect(list.json()[0].stats).toEqual({ displays: 1, completions: 1, rewardsGranted: 1, spendCents: 300 });

    const paused = await app.inject({ method: "POST", url: `/api/v1/admin/sponsorship-campaigns/${c.id}/pause`, headers: admin() });
    expect(paused.json().status).toBe("PAUSED");
    expect((await earnOnce()).offer).toBeNull();
  });

  it("admin can reject a submitted campaign with a reason", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign();
    await app.inject({ method: "POST", url: `/api/v1/sponsorship-campaigns/${c.id}/submit`, headers: owner() });
    const queue = await app.inject({ method: "GET", url: "/api/v1/admin/sponsorship-campaigns?status=SUBMITTED", headers: admin() });
    expect(queue.json().some((x: any) => x.id === c.id)).toBe(true);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/sponsorship-campaigns/${c.id}/reject`,
      headers: admin(),
      payload: { reason: "CTA URL is broken" },
    });
    expect(res.json()).toMatchObject({ status: "REJECTED", rejectionReason: "CTA URL is broken" });
  });
});

describe("sponsor-model independence", () => {
  it("a campaign with sponsorCategory omitted works end-to-end", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign(); // payload has no sponsorCategory key at all
    expect(c.sponsorCategory).toBeNull();
    await submitAndApprove(c.id);
    const { completion } = await earnOnce();
    expect(completion.rewarded).toBe(true);

    const wallet = await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devId}`, headers: developer() });
    expect(wallet.json().balances).toEqual([
      { rewardType: "COMPUTE_CREDITS", availableUnits: 25, pendingUnits: 0, ledgerAvailableUnits: 25 },
    ]);
  });

  it("a campaign with an explicit null sponsorCategory works end-to-end", async () => {
    if (!dbAvailable) return;
    const c = await createCampaign({ sponsorCategory: null });
    expect(c.sponsorCategory).toBeNull();
    await submitAndApprove(c.id);
    expect((await earnOnce()).completion.rewarded).toBe(true);
  });

  it("reward type and objective are independent of sponsor category", async () => {
    if (!dbAvailable) return;
    const rewardTypes = ["AI_CREDITS", "API_CREDITS", "COMPUTE_CREDITS", "TOOL_CREDITS", "CASH", "DISCOUNT", "SUBSCRIPTION_CREDIT", "OTHER"];
    const objectives = ["AWARENESS", "QUALIFIED_ENGAGEMENT", "PRODUCT_DISCOVERY", "TRIAL_ACTIVATION", "OTHER"];
    const categories: Array<string | undefined> = [undefined, "developer-tools", "an-arbitrary-sponsor-label"];

    let previous: string | null = null;
    for (let i = 0; i < rewardTypes.length; i++) {
      const rewardType = rewardTypes[i];
      const sponsorCategory = categories[i % categories.length];
      const c = await createCampaign({
        rewardType,
        objective: objectives[i % objectives.length],
        rewardAmountUnits: 10 + i,
        ...(sponsorCategory === undefined ? {} : { sponsorCategory }),
      });
      if (previous) await app.inject({ method: "POST", url: `/api/v1/admin/sponsorship-campaigns/${previous}/pause`, headers: admin() });
      await submitAndApprove(c.id);
      previous = c.id;

      const { offer, completion } = await earnOnce();
      expect(offer.campaignId).toBe(c.id);
      expect(completion.reward).toEqual({ rewardType, amountUnits: 10 + i, status: "APPROVED" });
    }

    const wallet = (await app.inject({ method: "GET", url: `/api/v1/wallet?developerId=${devId}`, headers: developer() })).json();
    expect(wallet.balances.map((b: any) => b.rewardType).sort()).toEqual([...rewardTypes].sort());
  });

  it("no required SponsorshipCampaign field needs an AI-provider-specific value", async () => {
    if (!dbAvailable) return;
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "SponsorshipCampaign")!;
    const required = model.fields
      .filter((f) => f.kind !== "object" && f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt && !f.isId)
      .map((f) => f.name)
      .sort();
    expect(required).toEqual(
      ["advertiserId", "name", "objective", "rewardAmountUnits", "rewardType", "sponsorChargeCents"].sort()
    );

    // The only enums a required field uses contain no provider names.
    for (const enumName of ["RewardType", "SponsorshipObjective"]) {
      const e = Prisma.dmmf.datamodel.enums.find((x) => x.name === enumName)!;
      for (const v of e.values) expect(v.name).not.toMatch(PROVIDER_NAMES);
    }
    // sponsorCategory is optional; eligibleClientTypes (the only field that
    // can name a specific client) defaults to "all clients".
    expect(model.fields.find((f) => f.name === "sponsorCategory")!.isRequired).toBe(false);
    expect(model.fields.find((f) => f.name === "eligibleClientTypes")!.hasDefaultValue).toBe(true);

    // And a campaign built from only those provider-neutral required fields persists.
    const created = await prisma.sponsorshipCampaign.create({
      data: {
        advertiserId,
        name: "Minimal",
        objective: "OTHER",
        rewardType: "OTHER",
        rewardAmountUnits: 1,
        sponsorChargeCents: 0,
      },
    });
    expect(created.sponsorCategory).toBeNull();
    expect(created.eligibleClientTypes).toEqual([]);
    expect(created.status).toBe("DRAFT");
  });
});
