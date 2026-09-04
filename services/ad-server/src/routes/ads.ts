import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "@devads/database";
import { AdSelectRequestSchema, type AdSelectResponse } from "@devads/shared";
import { isEligible, selectAd } from "@devads/targeting";
import { loadBudgetUsage, loadCampaignCandidates, loadImpressionHistory } from "../lib/candidates.js";
import { config } from "../lib/config.js";
import { requireSession } from "../lib/authGuard.js";

/**
 * POST /api/v1/ads/select
 *
 * The extension calls this only after its own local minimum-wait timer has
 * elapsed while a command is still running. The server independently
 * re-validates eligibility, applies targeting/budget/frequency-cap rules,
 * and -- if a candidate is selected -- creates the authoritative
 * AdImpression + IMPRESSION AdEvent rows itself (the client never supplies
 * or controls the event id used for money accounting).
 *
 * The caller's identity (developerId) is ALWAYS derived from the verified
 * session token, never from the request body -- context.developerId in the
 * request is ignored for authorization purposes. Without this, any caller
 * could request ads / consume frequency caps / trigger paid views as an
 * arbitrary other developer simply by guessing or enumerating ids.
 */
export async function registerAdsRoutes(app: FastifyInstance) {
  app.post("/api/v1/ads/select", { preHandler: requireSession }, async (req, reply) => {
    const parsed = AdSelectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const { context } = parsed.data;

    const developer = await prisma.developerProfile.findUnique({
      where: { userId: req.session!.sub },
    });
    if (!developer) {
      return reply.status(404).send({ error: "developer_not_found" });
    }

    const prefs = {
      // The extension already gates on its own local setting, but the
      // server independently re-checks the persisted preference so a
      // disabled developer never receives an ad even if a client is
      // compromised, buggy, or simply out of date.
      enabled: developer.adsEnabled,
      categoriesOptOut: developer.categoriesOptOut,
      frequencyCapOverride: developer.frequencyCapOverride ?? undefined,
    };

    if (!isEligible(context.command ?? "", prefs, 0, context.elapsedSeconds)) {
      const empty: AdSelectResponse = { ad: null };
      return reply.send(empty);
    }

    const now = new Date();
    const candidates = await loadCampaignCandidates();
    const budgetByCampaignId = await loadBudgetUsage(
      candidates.map((c) => c.campaignId),
      now
    );
    const history = await loadImpressionHistory(developer.id, now);

    const winner = selectAd({
      candidates,
      context: {
        command: context.command ?? "",
        language: context.language,
        frameworks: context.framework ? [context.framework] : [],
        runtime: context.runtime,
        platform: context.platform,
        country: context.country,
      },
      prefs,
      dev: { developerId: developer.id, frequencyCapOverride: developer.frequencyCapOverride ?? undefined },
      history,
      budgetByCampaignId,
      frequencyCapConfig: config.frequencyCap,
      now,
    });

    if (!winner) {
      const empty: AdSelectResponse = { ad: null };
      return reply.send(empty);
    }

    const creative = await prisma.campaignCreative.findUnique({ where: { id: winner.creativeId } });
    if (!creative) {
      const empty: AdSelectResponse = { ad: null };
      return reply.send(empty);
    }

    const impressionEventId = randomUUID();
    const impression = await prisma.$transaction(async (tx) => {
      const imp = await tx.adImpression.create({
        data: {
          campaignId: winner.campaignId,
          creativeId: winner.creativeId,
          developerId: developer.id,
          installationId: context.installationId,
          command: context.command,
          eventId: impressionEventId,
          cpmCents: winner.cpmCents,
          currency: "USD",
        },
      });
      await tx.adEvent.create({
        data: {
          eventId: impressionEventId,
          type: "IMPRESSION",
          campaignId: winner.campaignId,
          impressionId: imp.id,
          developerId: developer.id,
        },
      });
      return imp;
    });

    const response: AdSelectResponse = {
      ad: {
        impressionId: impression.id,
        campaignId: winner.campaignId,
        creativeId: creative.id,
        type: creative.type,
        headline: creative.headline,
        body: creative.body,
        ctaLabel: creative.ctaLabel,
        ctaUrl: creative.ctaUrl,
        eventId: impressionEventId,
      },
    };
    return reply.send(response);
  });
}
