import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type SponsoredOffer, type SponsorshipCampaign } from "@devads/database";
import {
  CreateSponsorshipCampaignSchema,
  SponsoredOfferInputSchema,
  SponsorshipCampaignStatusSchema,
  UpdateSponsorshipCampaignSchema,
  type AdminSponsorshipCampaignDTO,
  type SponsorshipCampaignDTO,
} from "@devads/shared";
import { requireAdmin, requireSession } from "../lib/authGuard.js";
import { isAdvertiserMember } from "../lib/advertiserMembership.js";
import { loadSponsorshipCampaignStats } from "../lib/sponsorshipCampaignStats.js";

const IdParams = z.object({ id: z.string().min(1) });
const RejectBody = z.object({ reason: z.string().min(1).max(500) });

type CampaignWithOffers = SponsorshipCampaign & { offers: SponsoredOffer[] };

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Explicit DTO mapping; Prisma rows (incl. internal carry state) are never sent to clients. */
function toCampaignDTO(c: CampaignWithOffers, stats?: SponsorshipCampaignDTO["stats"]): SponsorshipCampaignDTO {
  return {
    id: c.id,
    advertiserId: c.advertiserId,
    name: c.name,
    sponsorCategory: c.sponsorCategory,
    objective: c.objective,
    rewardType: c.rewardType,
    rewardAmountUnits: c.rewardAmountUnits,
    sponsorChargeCents: c.sponsorChargeCents,
    currency: c.currency,
    totalBudgetCents: c.totalBudgetCents,
    dailyBudgetCents: c.dailyBudgetCents,
    developerDailyCap: c.developerDailyCap,
    developerLifetimeCap: c.developerLifetimeCap,
    frequencyCapPerDay: c.frequencyCapPerDay,
    mode: c.mode,
    minEngagementSeconds: c.minEngagementSeconds,
    eligibleClientTypes: c.eligibleClientTypes,
    startDate: c.startDate.toISOString(),
    endDate: iso(c.endDate),
    status: c.status,
    rejectionReason: c.rejectionReason,
    submittedAt: iso(c.submittedAt),
    approvedAt: iso(c.approvedAt),
    createdAt: c.createdAt.toISOString(),
    offers: c.offers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      ctaUrl: o.ctaUrl,
      requiredAction: o.requiredAction,
      expiresAt: iso(o.expiresAt),
      status: o.status,
    })),
    ...(stats ? { stats } : {}),
  };
}

/**
 * Sponsor-facing SponsorshipCampaign management (Draft -> Submitted) and the
 * admin approval queue (approve / reject / pause). Organized exactly like
 * campaigns.ts: every sponsor route is requireSession + advertiser
 * membership, every admin route is requireAdmin. Spend, carry and the
 * reward ledger are never writable here; only POST /api/v1/sponsorships/events
 * creates spend and reward rows.
 */
export async function registerSponsorshipCampaignRoutes(app: FastifyInstance) {
  app.post("/api/v1/sponsorship-campaigns", { preHandler: requireSession }, async (req, reply) => {
    const parsed = CreateSponsorshipCampaignSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const input = parsed.data;

    const advertiser = await prisma.advertiser.findUnique({ where: { id: input.advertiserId } });
    if (!advertiser) return reply.status(404).send({ error: "advertiser_not_found" });
    if (advertiser.status !== "ACTIVE") return reply.status(403).send({ error: "advertiser_suspended" });
    if (!(await isAdvertiserMember(req.session!.sub, input.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const campaign = await prisma.sponsorshipCampaign.create({
      data: {
        advertiserId: input.advertiserId,
        name: input.name,
        sponsorCategory: input.sponsorCategory ?? null,
        objective: input.objective,
        rewardType: input.rewardType,
        rewardAmountUnits: input.rewardAmountUnits,
        sponsorChargeCents: input.sponsorChargeCents,
        currency: input.currency,
        totalBudgetCents: input.totalBudgetCents ?? null,
        dailyBudgetCents: input.dailyBudgetCents ?? null,
        developerDailyCap: input.developerDailyCap ?? null,
        developerLifetimeCap: input.developerLifetimeCap ?? null,
        frequencyCapPerDay: input.frequencyCapPerDay ?? null,
        minEngagementSeconds: input.minEngagementSeconds ?? null,
        eligibleClientTypes: input.eligibleClientTypes,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        status: "DRAFT",
        offers: input.offers ? { create: input.offers } : undefined,
      },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(campaign));
  });

  app.patch("/api/v1/sponsorship-campaigns/:id", { preHandler: requireSession }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const parsed = UpdateSponsorshipCampaignSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.sponsorshipCampaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_editable" });

    const startDate = parsed.data.startDate ?? campaign.startDate;
    const endDate = parsed.data.endDate === undefined ? campaign.endDate : parsed.data.endDate;
    if (endDate && endDate <= startDate) return reply.status(400).send({ error: "invalid_date_range" });

    const updated = await prisma.sponsorshipCampaign.update({
      where: { id: campaign.id },
      data: parsed.data,
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(updated));
  });

  app.post("/api/v1/sponsorship-campaigns/:id/offers", { preHandler: requireSession }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const parsed = SponsoredOfferInputSchema.safeParse(req.body);
    if (!params.success || !parsed.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.sponsorshipCampaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_editable" });

    await prisma.sponsoredOffer.create({ data: { campaignId: campaign.id, ...parsed.data } });
    const withOffers = await prisma.sponsorshipCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(withOffers));
  });

  app.post("/api/v1/sponsorship-campaigns/:id/submit", { preHandler: requireSession }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const campaign = await prisma.sponsorshipCampaign.findUnique({
      where: { id: params.data.id },
      include: { offers: true },
    });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (!(await isAdvertiserMember(req.session!.sub, campaign.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (campaign.status !== "DRAFT") return reply.status(409).send({ error: "campaign_not_in_draft" });
    if (!campaign.offers.some((o) => o.status === "ACTIVE")) {
      return reply.status(400).send({ error: "campaign_needs_at_least_one_offer" });
    }

    const updated = await prisma.sponsorshipCampaign.update({
      where: { id: campaign.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(updated));
  });

  app.get("/api/v1/sponsorship-campaigns", { preHandler: requireSession }, async (req, reply) => {
    const query = z.object({ advertiserId: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_request" });
    if (!(await isAdvertiserMember(req.session!.sub, query.data.advertiserId))) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const campaigns = await prisma.sponsorshipCampaign.findMany({
      where: { advertiserId: query.data.advertiserId },
      include: { offers: true },
      orderBy: { createdAt: "desc" },
    });

    const withStats = await Promise.all(
      campaigns.map(async (c) => toCampaignDTO(c, await loadSponsorshipCampaignStats(c.id)))
    );
    return reply.send(withStats);
  });

  // --- Admin approval queue --------------------------------------------------
  /**
   * Every field of the sponsor DTO, plus (additively) the advertiser's name
   * and the same whole-campaign stats the sponsor list computes. Read-only.
   */
  app.get("/api/v1/admin/sponsorship-campaigns", { preHandler: requireAdmin }, async (req, reply) => {
    const query = z.object({ status: SponsorshipCampaignStatusSchema.optional() }).safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: "invalid_request" });
    const campaigns = await prisma.sponsorshipCampaign.findMany({
      where: query.data.status ? { status: query.data.status } : undefined,
      include: { offers: true, advertiser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const enriched: AdminSponsorshipCampaignDTO[] = await Promise.all(
      campaigns.map(async (c) => {
        const stats = await loadSponsorshipCampaignStats(c.id);
        return { ...toCampaignDTO(c, stats), stats, advertiserName: c.advertiser.name };
      })
    );
    return reply.send(enriched);
  });

  app.post("/api/v1/admin/sponsorship-campaigns/:id/approve", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.sponsorshipCampaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "SUBMITTED") return reply.status(409).send({ error: "campaign_not_submitted" });

    const updated = await prisma.sponsorshipCampaign.update({
      where: { id: campaign.id },
      data: { status: "APPROVED", approvedAt: new Date(), rejectionReason: null },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(updated));
  });

  app.post("/api/v1/admin/sponsorship-campaigns/:id/reject", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const body = RejectBody.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.sponsorshipCampaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "SUBMITTED") return reply.status(409).send({ error: "campaign_not_submitted" });

    const updated = await prisma.sponsorshipCampaign.update({
      where: { id: campaign.id },
      data: { status: "REJECTED", rejectionReason: body.data.reason },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(updated));
  });

  app.post("/api/v1/admin/sponsorship-campaigns/:id/pause", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });
    const campaign = await prisma.sponsorshipCampaign.findUnique({ where: { id: params.data.id } });
    if (!campaign) return reply.status(404).send({ error: "campaign_not_found" });
    if (campaign.status !== "APPROVED") return reply.status(409).send({ error: "campaign_not_approved" });

    const updated = await prisma.sponsorshipCampaign.update({
      where: { id: campaign.id },
      data: { status: "PAUSED" },
      include: { offers: true },
    });
    return reply.send(toCampaignDTO(updated));
  });
}
