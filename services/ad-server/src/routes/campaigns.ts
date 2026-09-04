import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devads/database";
import { CreateCampaignSchema } from "@devads/shared";
import { hashPassword, signSession } from "@devads/auth";
import { config } from "../lib/config.js";
import { requireAdmin, requireSession } from "../lib/authGuard.js";
import { getCreativeUrl, uploadCreativeFile, validateCreativeUpload } from "../lib/storage.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

/** True if the signed-in user (req.session.sub) is a member of advertiserId. */
async function isAdvertiserMember(userId: string, advertiserId: string): Promise<boolean> {
  const membership = await prisma.advertiserMember.findUnique({
    where: { advertiserId_userId: { advertiserId, userId } },
  });
  return membership !== null;
}

const AdvertiserSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  companyName: z.string().min(1).max(200),
  website: z.string().url().optional(),
});

const CreativeSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
  headline: z.string().min(1).max(200),
  body: z.string().max(500).optional(),
  ctaLabel: z.string().min(1).max(40).default("Learn more"),
  ctaUrl: z.string().url(),
  imageKey: z.string().optional(),
  videoKey: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

const AdminActionParams = z.object({ id: z.string().min(1) });
const RejectBody = z.object({ reason: z.string().min(1).max(500) });

/**
 * Advertiser account creation, campaign CRUD (Draft -> Submitted), creative
 * upload metadata, and the admin approval queue (approve/reject/pause).
 * Money/spend is never writable here -- only /api/v1/events can create
 * campaign_spend rows, keeping the client (and even the advertiser/admin
 * dashboards) unable to directly manipulate accounting state.
 */
export async function registerCampaignsRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/advertisers/signup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const parsed = AdvertiserSignupSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const { email, password, companyName, website } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(409).send({ error: "email_already_registered" });

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash: hashPassword(password), role: "ADVERTISER" },
      });
      const advertiser = await tx.advertiser.create({
        data: { name: companyName, website, status: "ACTIVE" },
      });
      await tx.advertiserMember.create({
        data: { advertiserId: advertiser.id, userId: user.id, role: "OWNER" },
      });
      await tx.advertiserBillingAccount.create({
        data: { advertiserId: advertiser.id, provider: "MOCK", currency: config.platformDefaultCurrency },
      });
      return { user, advertiser };
    });

      const token = signSession({ sub: result.user.id, role: "ADVERTISER" }, SESSION_SECRET);
      return reply.send({ userId: result.user.id, advertiserId: result.advertiser.id, token });
    }
  );

  app.post("/api/v1/campaigns", { preHandler: requireSession }, async (req, reply) => {
    const parsed = CreateCampaignSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const input = parsed.data;

    const advertiser = await prisma.advertiser.findUnique({ where: { id: input.advertiserId } });
    if (!advertiser) return reply.status(404).send({ error: "advertiser_not_found" });
    if (advertiser.status !== "ACTIVE") return reply.status(403).send({ error: "advertiser_suspended" });
    if (!(await isAdvertiserMember(req.session!.sub, input.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: input.advertiserId,
        name: input.name,
        cpmCents: input.cpmCents,
        currency: input.currency,
        dailyBudgetCents: input.dailyBudgetCents,
        totalBudgetCents: input.totalBudgetCents,
        status: "DRAFT",
        targets: input.targets
          ? {
              create: {
                languages: input.targets.languages,
                frameworks: input.targets.frameworks,
                runtimes: input.targets.runtimes,
                platforms: input.targets.platforms,
                countries: input.targets.countries,
                categories: input.targets.categories,
              },
            }
          : undefined,
      },
      include: { targets: true },
    });

    return reply.send(campaign);
  });

  app.post("/api/v1/campaigns/:id/creatives", { preHandler: requireSession }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    const parsed = CreativeSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.campaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_editable" });

    const creative = await prisma.campaignCreative.create({
      data: { campaignId: campaign.id, ...parsed.data },
    });
    return reply.send(creative);
  });

  /**
   * POST /api/v1/campaigns/:id/upload
   *
   * Accepts a single multipart file (image or video), validates MIME type
   * and size server-side (never trusts the client's declared content type
   * or a file extension), and uploads it to object storage. Returns the
   * storage key + real detected size for the caller to pass into
   * POST .../creatives -- kept as a separate step so creative metadata
   * (headline, CTA, etc.) can be created/edited without re-uploading.
   */
  app.post("/api/v1/campaigns/:id/upload", { preHandler: requireSession }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.campaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_editable" });

    const kindQuery = z.object({ kind: z.enum(["IMAGE", "VIDEO"]).default("IMAGE") }).safeParse(req.query);
    const kind = kindQuery.success ? kindQuery.data.kind : "IMAGE";

    const file = await req.file();
    if (!file) return reply.status(400).send({ error: "no_file_uploaded" });

    const buffer = await file.toBuffer();
    const validationError = validateCreativeUpload(file.mimetype, buffer.length, kind);
    if (validationError) return reply.status(400).send(validationError);

    const key = await uploadCreativeFile(campaign.id, file.mimetype, buffer);
    return reply.send({ key, mimeType: file.mimetype, sizeBytes: buffer.length });
  });

  app.get("/api/v1/creatives/:id/url", { preHandler: requireSession }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const creative = await prisma.campaignCreative.findUnique({ where: { id: params.data.id } });
    if (!creative) return reply.status(404).send({ error: "creative_not_found" });

    const key = creative.imageKey ?? creative.videoKey;
    if (!key) return reply.status(404).send({ error: "no_uploaded_file" });

    const url = await getCreativeUrl(key);
    return reply.send({ url });
  });

  app.post("/api/v1/campaigns/:id/submit", { preHandler: requireSession }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.campaign.findUnique({
      where: { id: params.data.id },
      include: { creatives: true, targets: true },
    });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_in_draft" });
    if (campaign.creatives.length === 0) return reply.status(400).send({ error: "campaign_needs_at_least_one_creative" });

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    return reply.send(updated);
  });

  app.get("/api/v1/campaigns", { preHandler: requireSession }, async (req, reply) => {
    const query = z.object({ advertiserId: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_request" });
    if (!(await isAdvertiserMember(req.session!.sub, query.data.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { advertiserId: query.data.advertiserId },
      include: { creatives: true, targets: true },
      orderBy: { createdAt: "desc" },
    });

    const withStats = await Promise.all(
      campaigns.map(async (c) => {
        const [impressions, clicks, spend] = await Promise.all([
          prisma.adImpression.count({ where: { campaignId: c.id } }),
          prisma.clickEvent.count({ where: { campaignId: c.id } }),
          prisma.campaignSpend.aggregate({ where: { campaignId: c.id }, _sum: { amountCents: true } }),
        ]);
        const spendCents = spend._sum.amountCents ?? 0;
        return {
          ...c,
          stats: {
            impressions,
            clicks,
            ctr: impressions > 0 ? clicks / impressions : 0,
            spendCents,
          },
        };
      })
    );

    return reply.send(withStats);
  });

  // --- Admin approval queue --------------------------------------------------
  app.get("/api/v1/admin/campaigns", { preHandler: requireAdmin }, async (req, reply) => {
    const query = z.object({ status: z.string().optional() }).safeParse(req.query);
    const status = query.success ? query.data.status : undefined;
    const campaigns = await prisma.campaign.findMany({
      where: status ? { status: status as any } : undefined,
      include: { advertiser: true, creatives: true, targets: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(campaigns);
  });

  app.post("/api/v1/admin/campaigns/:id/approve", { preHandler: requireAdmin }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.campaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "SUBMITTED") return reply.status(409).send({ error: "campaign_not_submitted" });

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "APPROVED", approvedAt: new Date(), rejectionReason: null },
    });
    return reply.send(updated);
  });

  app.post("/api/v1/admin/campaigns/:id/reject", { preHandler: requireAdmin }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    const body = RejectBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.campaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "SUBMITTED") return reply.status(409).send({ error: "campaign_not_submitted" });

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "REJECTED", rejectionReason: body.data.reason },
    });
    return reply.send(updated);
  });

  app.post("/api/v1/admin/campaigns/:id/pause", { preHandler: requireAdmin }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.campaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "APPROVED") return reply.status(409).send({ error: "campaign_not_approved" });

    const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
    return reply.send(updated);
  });

  app.post("/api/v1/admin/advertisers/:id/suspend", { preHandler: requireAdmin }, async (req, reply) => {
    const params = AdminActionParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });
    const advertiser = await prisma.advertiser.findUnique({ where: { id: params.data.id } });
    if (!advertiser) return reply.status(404).send({ error: "advertiser_not_found" });

    const updated = await prisma.advertiser.update({ where: { id: advertiser.id }, data: { status: "SUSPENDED" } });
    return reply.send(updated);
  });

  // --- Admin platform overview -----------------------------------------------
  app.get("/api/v1/admin/overview", { preHandler: requireAdmin }, async (_req, reply) => {
    const [developers, advertisers, campaigns, impressions, spend, earnings, pendingApprovals, openFraudFlags] =
      await Promise.all([
        prisma.developerProfile.count(),
        prisma.advertiser.count(),
        prisma.campaign.count({ where: { status: "APPROVED" } }),
        prisma.adImpression.count(),
        prisma.campaignSpend.aggregate({ _sum: { amountCents: true } }),
        prisma.developerEarningsLedger.aggregate({ _sum: { amountCents: true } }),
        prisma.campaign.count({ where: { status: "SUBMITTED" } }),
        prisma.fraudFlag.count({ where: { status: "OPEN" } }),
      ]);

    const totalSpendCents = spend._sum.amountCents ?? 0;
    const totalDeveloperPayoutCents = earnings._sum.amountCents ?? 0;
    const platformRevenueCents = totalSpendCents - totalDeveloperPayoutCents;

    return reply.send({
      developers,
      advertisers,
      activeCampaigns: campaigns,
      impressions,
      totalSpendCents,
      totalDeveloperPayoutLiabilityCents: totalDeveloperPayoutCents,
      platformRevenueCents,
      pendingApprovals,
      openFraudFlags,
      developerRevenueShareBps: config.defaultDeveloperRevenueShareBps,
    });
  });
}
