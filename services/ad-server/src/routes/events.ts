import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@devads/database";
import { AdEventRequestSchema } from "@devads/shared";
import { computeImpressionEarningsCents } from "@devads/shared";
import { config } from "../lib/config.js";

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
 */
export async function registerEventsRoutes(app: FastifyInstance) {
  app.post("/api/v1/events", async (req, reply) => {
    const parsed = AdEventRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    if (body.type === "IMPRESSION") {
      return reply.status(400).send({ error: "impressions_are_server_authoritative" });
    }

    const developer = await prisma.developerProfile.findUnique({ where: { id: body.developerId } });
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
      const earningsCents = computeImpressionEarningsCents(
        impression.cpmCents,
        config.defaultDeveloperRevenueShareBps
      );
      const impressionCostCents = Math.floor(impression.cpmCents / 1000);

      try {
        await prisma.$transaction([
          prisma.developerEarningsLedger.create({
            data: {
              developerId: developer.id,
              campaignId: impression.campaignId,
              impressionEventId: impression.eventId,
              amountCents: earningsCents,
              currency: impression.currency,
              description: "Qualified view revenue share",
            },
          }),
          prisma.campaignSpend.create({
            data: {
              campaignId: impression.campaignId,
              amountCents: impressionCostCents,
              currency: impression.currency,
              reason: "IMPRESSION",
            },
          }),
        ]);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION)) throw err;
      }
    }

    return reply.send({ ok: true });
  });
}
