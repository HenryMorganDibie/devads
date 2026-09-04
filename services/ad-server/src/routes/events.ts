import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@devads/database";
import {
  AdEventRequestSchema,
  impressionCostMilliCents,
  impressionEarningsMilliCents,
  resolveCarry,
} from "@devads/shared";
import { config } from "../lib/config.js";
import { requireSession } from "../lib/authGuard.js";

const UNIQUE_VIOLATION = "P2002";

/**
 * POST /api/v1/events
 *
 * Handles CLICK / DISMISS / VIEW_COMPLETE reporting from the extension.
 * IMPRESSION events are never accepted here -- they are created
 * server-side by /api/v1/ads/select, since the client must never be
 * authoritative for what counts as an impression.
 *
 * Idempotent: eventId is a client-generated UUID but the unique DB
 * constraint on ad_events.event_id means a retried/duplicated request is a
 * safe no-op rather than double-counting.
 *
 * Only a qualifying VIEW_COMPLETE (viewDurationMs >= the platform's minimum
 * payable view duration) generates a developer earnings ledger entry and a
 * campaign spend entry -- and only once per impression, enforced by the
 * unique constraint on developer_earnings_ledger.impression_event_id.
 *
 * The caller's identity is derived from the verified session, never from
 * body.developerId -- otherwise anyone could report a VIEW_COMPLETE as an
 * arbitrary other developer, crediting that developer's ledger and
 * charging the advertiser for a view that never happened.
 */
export async function registerEventsRoutes(app: FastifyInstance) {
  app.post("/api/v1/events", { preHandler: requireSession }, async (req, reply) => {
    const parsed = AdEventRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    if (body.type === "IMPRESSION") {
      return reply.status(400).send({ error: "impressions_are_server_authoritative" });
    }

    const developer = await prisma.developerProfile.findUnique({ where: { userId: req.session!.sub } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    let impression = null as Awaited<ReturnType<typeof prisma.adImpression.findUnique>>;
    if (body.impressionId) {
      impression = await prisma.adImpression.findUnique({ where: { id: body.impressionId } });
      if (!impression || impression.developerId !== developer.id || impression.campaignId !== body.campaignId) {
        return reply.status(400).send({ error: "impression_mismatch" });
      }
    }

    try {
      await prisma.adEvent.create({
        data: {
          eventId: body.eventId,
          type: body.type,
          campaignId: body.campaignId,
          impressionId: impression?.id,
          developerId: developer.id,
          viewDurationMs: body.viewDurationMs,
          metadata: body.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return reply.send({ ok: true, idempotent: true });
      }
      throw err;
    }

    if (body.type === "CLICK") {
      try {
        await prisma.clickEvent.create({
          data: {
            eventId: `${body.eventId}-click`,
            campaignId: body.campaignId,
            developerId: developer.id,
            targetUrl: "",
          },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION)) throw err;
      }
    }

    const isPayableView =
      body.type === "VIEW_COMPLETE" &&
      impression &&
      (body.viewDurationMs ?? 0) >= config.minViewDurationMsForPayableImpression;

    if (isPayableView && impression) {
      // Both campaign spend and developer earnings use a persisted
      // milli-cent carry (Campaign.spendCarryMilliCents /
      // DeveloperProfile.earningsCarryMilliCents) rather than flooring each
      // impression's fractional cent individually -- flooring per
      // impression systematically understates a fractional-CPM campaign's
      // true spend/earnings (e.g. a $15 CPM is 1.5 cents/impression; every
      // impression flooring to 1 cent loses exactly half the true cost).
      // The carry accumulates exactly and only realizes a whole cent once
      // enough fractional cost has accrued, so the running total is always
      // exact over any number of impressions.
      try {
        await prisma.$transaction(async (tx) => {
          const costAddMilliCents = impressionCostMilliCents(impression!.cpmCents);

          const campaignAfter = await tx.campaign.update({
            where: { id: impression!.campaignId },
            data: { spendCarryMilliCents: { increment: costAddMilliCents } },
          });
          const spendResolved = resolveCarry(0, campaignAfter.spendCarryMilliCents);
          await tx.campaign.update({
            where: { id: impression!.campaignId },
            data: { spendCarryMilliCents: spendResolved.newCarryMilliCents },
          });
          if (spendResolved.wholeCents > 0) {
            await tx.campaignSpend.create({
              data: {
                campaignId: impression!.campaignId,
                amountCents: spendResolved.wholeCents,
                currency: impression!.currency,
                reason: "IMPRESSION",
              },
            });
          }

          const earnAddMilliCents = impressionEarningsMilliCents(
            costAddMilliCents,
            config.defaultDeveloperRevenueShareBps
          );
          const developerAfter = await tx.developerProfile.update({
            where: { id: developer.id },
            data: { earningsCarryMilliCents: { increment: earnAddMilliCents } },
          });
          const earnResolved = resolveCarry(0, developerAfter.earningsCarryMilliCents);
          await tx.developerProfile.update({
            where: { id: developer.id },
            data: { earningsCarryMilliCents: earnResolved.newCarryMilliCents },
          });

          // Always create exactly one ledger row per impression (even when
          // amountCents is 0) -- the unique constraint on
          // impressionEventId is what stops a duplicate VIEW_COMPLETE (a
          // *different* client-generated eventId for the same impression)
          // from crediting the carry twice. If this throws, the whole
          // transaction -- including the carry increments above -- rolls
          // back, so a rejected duplicate never leaves a partial credit.
          await tx.developerEarningsLedger.create({
            data: {
              developerId: developer.id,
              campaignId: impression!.campaignId,
              impressionEventId: impression!.eventId,
              amountCents: earnResolved.wholeCents,
              currency: impression!.currency,
              description: "Qualified view revenue share",
            },
          });
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION)) throw err;
      }
    }

    return reply.send({ ok: true });
  });
}
