import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devads/database";
import { createPayoutProvider, money } from "@devads/shared";
import { requireSession } from "../lib/authGuard.js";

const payoutProvider = createPayoutProvider(process.env.PAYOUT_PROVIDER, process.env.STRIPE_SECRET_KEY);

const QuerySchema = z.object({ developerId: z.string().min(1) });

function startOfUtc(offsetDays: number, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d;
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * GET /api/v1/earnings?developerId=...
 *
 * Read-only rollup over developer_earnings_ledger -- the ledger itself is
 * the source of truth; this just aggregates it into the today/week/month/
 * lifetime view the developer dashboard shows. No writes happen here.
 */
export async function registerEarningsRoutes(app: FastifyInstance) {

  app.get("/api/v1/earnings", { preHandler: requireSession }, async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { developerId } = parsed.data;

    const developer = await prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    if (developer.userId !== req.session!.sub) return reply.status(403).send({ error: "forbidden" });

    const now = new Date();
    const todayStart = startOfUtc(0, now);
    const weekStart = startOfUtc(6, now);
    const monthStart = startOfUtcMonth(now);

    const [today, week, month, lifetime, impressionCount, clickCount, payouts] = await Promise.all([
      prisma.developerEarningsLedger.aggregate({
        where: { developerId, createdAt: { gte: todayStart } },
        _sum: { amountCents: true },
      }),
      prisma.developerEarningsLedger.aggregate({
        where: { developerId, createdAt: { gte: weekStart } },
        _sum: { amountCents: true },
      }),
      prisma.developerEarningsLedger.aggregate({
        where: { developerId, createdAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
      prisma.developerEarningsLedger.aggregate({
        where: { developerId },
        _sum: { amountCents: true },
      }),
      prisma.adImpression.count({ where: { developerId } }),
      prisma.clickEvent.count({ where: { developerId } }),
      prisma.payout.findMany({ where: { developerId }, orderBy: { requestedAt: "desc" }, take: 20 }),
    ]);

    const lifetimeCents = lifetime._sum.amountCents ?? 0;
    const paidOutCents = payouts
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amountCents, 0);
    const pendingBalanceCents = lifetimeCents - paidOutCents;

    return reply.send({
      currency: developer.currency,
      today: today._sum.amountCents ?? 0,
      thisWeek: week._sum.amountCents ?? 0,
      thisMonth: month._sum.amountCents ?? 0,
      lifetime: lifetimeCents,
      impressions: impressionCount,
      clicks: clickCount,
      availableBalanceCents: Math.max(0, pendingBalanceCents),
      payoutThresholdCents: developer.payoutThresholdCents,
      payouts: payouts.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        requestedAt: p.requestedAt,
        processedAt: p.processedAt,
      })),
    });
  });

  /**
   * POST /api/v1/earnings/payout
   *
   * Requests a payout of the developer's full available balance. The
   * server recomputes the available balance itself (lifetime ledger sum
   * minus already-PAID payouts) rather than trusting anything from the
   * client, enforces the minimum payout threshold, and only marks the
   * Payout row PAID after the PayoutProvider confirms success -- a failed
   * provider call leaves it PENDING/FAILED instead of silently paying out.
   */
  app.post("/api/v1/earnings/payout", { preHandler: requireSession }, async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { developerId } = parsed.data;

    const developer = await prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    if (developer.userId !== req.session!.sub) return reply.status(403).send({ error: "forbidden" });

    const [lifetime, paidOut] = await Promise.all([
      prisma.developerEarningsLedger.aggregate({ where: { developerId }, _sum: { amountCents: true } }),
      prisma.payout.aggregate({ where: { developerId, status: "PAID" }, _sum: { amountCents: true } }),
    ]);
    const availableCents = (lifetime._sum.amountCents ?? 0) - (paidOut._sum.amountCents ?? 0);

    if (availableCents < developer.payoutThresholdCents) {
      return reply.status(400).send({ error: "below_payout_threshold", availableCents, thresholdCents: developer.payoutThresholdCents });
    }

    const payout = await prisma.payout.create({
      data: {
        developerId,
        amountCents: availableCents,
        currency: developer.currency,
        status: "PENDING",
        provider: payoutProvider.kind,
      },
    });

    const result = await payoutProvider.requestPayout({
      developerId,
      amount: money(availableCents, developer.currency),
    });

    const updated = await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: result.status,
        providerRef: result.providerRef || null,
        failureReason: result.failureReason,
        processedAt: result.status === "PAID" ? new Date() : null,
      },
    });

    return reply.send(updated);
  });
}
