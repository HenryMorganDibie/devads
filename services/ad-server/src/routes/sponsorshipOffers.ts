import type { FastifyInstance } from "fastify";
import { prisma } from "@devads/database";
import {
  SponsoredOfferListRequestSchema,
  type SponsoredOfferListResponse,
  type SponsoredOfferListing,
} from "@devads/shared";
import { listEligibleSponsoredOffers } from "@devads/targeting";
import { requireSession } from "../lib/authGuard.js";
import {
  loadRewardCounts,
  loadSponsorshipBudgetUsage,
  loadSponsorshipCandidates,
} from "../lib/sponsorshipCandidates.js";

/** Upper bound on listed offers; a browsing page never needs more. */
const MAX_LISTED_OFFERS = 50;

/**
 * GET /api/v1/sponsorships/offers?clientType=...
 *
 * Read-only listing of the live sponsored offers the signed-in developer is
 * eligible for: the marketplace-browsing counterpart to the selection
 * endpoint GET /api/v1/sponsorships/offer (singular), which stays the only
 * way an offer is actually served.
 *
 * This handler performs reads only. It never creates a SponsorshipEvent
 * (so no OFFER_DISPLAYED, no frequency-cap consumption, nothing counted in
 * sponsor display stats), never writes SponsorshipCampaignSpend and never
 * updates a campaign. The helpers it uses from sponsorshipCandidates.ts are
 * findMany/groupBy reads. Listed offers carry no displayEventId, so they
 * cannot be reported against or completed.
 *
 * Eligibility is re-derived server-side from the database with the same
 * pure predicates as selection (see listEligibleSponsoredOffers); the
 * developer comes from the verified session and the only client input is an
 * optional clientType filter.
 */
export async function registerSponsorshipOfferListingRoutes(app: FastifyInstance) {
  app.get("/api/v1/sponsorships/offers", { preHandler: requireSession }, async (req, reply) => {
    const parsed = SponsoredOfferListRequestSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });

    const developer = await prisma.developerProfile.findUnique({ where: { userId: req.session!.sub } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    if (!developer.adsEnabled) {
      const optedOut: SponsoredOfferListResponse = { sponsoredContentEnabled: false, offers: [] };
      return reply.send(optedOut);
    }

    const now = new Date();
    const candidates = await loadSponsorshipCandidates(now);
    const campaignIds = candidates.map((c) => c.campaignId);
    const [budgetByCampaignId, rewardCountsByCampaignId] = await Promise.all([
      loadSponsorshipBudgetUsage(campaignIds, now),
      loadRewardCounts(developer.id, campaignIds, now),
    ]);

    const eligible = listEligibleSponsoredOffers({
      candidates,
      dev: {
        developerId: developer.id,
        enabled: developer.adsEnabled,
        clientType: parsed.data.clientType,
        categoriesOptOut: developer.categoriesOptOut,
      },
      budgetByCampaignId,
      rewardCountsByCampaignId,
      now,
    });

    const byOfferId = new Map(candidates.map((c) => [c.offerId, c]));
    const offers: SponsoredOfferListing[] = eligible.slice(0, MAX_LISTED_OFFERS).map((c) => {
      const offer = byOfferId.get(c.offerId)!.offer;
      return {
        offerId: offer.id,
        campaignId: c.campaignId,
        title: offer.title,
        description: offer.description,
        ctaUrl: offer.ctaUrl,
        requiredAction: offer.requiredAction,
        rewardType: c.rewardType as SponsoredOfferListing["rewardType"],
        rewardAmountUnits: c.rewardAmountUnits,
        expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
        eligibleClientTypes: c.eligibleClientTypes as SponsoredOfferListing["eligibleClientTypes"],
      };
    });

    const response: SponsoredOfferListResponse = { sponsoredContentEnabled: true, offers };
    return reply.send(response);
  });
}
