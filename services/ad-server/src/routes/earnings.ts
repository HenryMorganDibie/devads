import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devads/database";

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
  app.get("/api/v1/earnings", async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { developerId } = parsed.data;

    const developer = await prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

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
}
