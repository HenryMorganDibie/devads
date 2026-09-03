import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@devads/database";
import { requireSession } from "../lib/authGuard.js";

const ParamsSchema = z.object({ id: z.string().min(1) });
const PreferencesSchema = z.object({
  adsEnabled: z.boolean().optional(),
  frequencyCapOverride: z.number().int().positive().nullable().optional(),
  preferredCategories: z.array(z.string()).optional(),
});

/**
 * Developer preference reads/writes -- the same enable/disable switch the
 * web dashboard and the VS Code extension settings both drive. Writing
 * here is the only way adsEnabled changes; /api/v1/ads/select always reads
 * the persisted value, so disabling ads here takes effect immediately
 * regardless of which client made the change.
 *
 * All routes here require a valid session AND that the session's user owns
 * the developer profile being read/modified/deleted -- a signed-in
 * developer can never read or change another developer's data.
 */
export async function registerDeveloperRoutes(app: FastifyInstance) {
  async function loadOwnedDeveloper(req: any, reply: any, id: string) {
    const developer = await prisma.developerProfile.findUnique({ where: { id } });
    if (!developer) {
      reply.status(404).send({ error: "developer_not_found" });
      return null;
    }
    if (developer.userId !== req.session.sub) {
      reply.status(403).send({ error: "forbidden" });
      return null;
    }
    return developer;
  }

  app.get("/api/v1/developers/:id/preferences", { preHandler: requireSession }, async (req, reply) => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const developer = await loadOwnedDeveloper(req, reply, params.data.id);
    if (!developer) return;

    return reply.send({
      adsEnabled: developer.adsEnabled,
      frequencyCapOverride: developer.frequencyCapOverride,
      preferredCategories: developer.preferredCategories,
      payoutThresholdCents: developer.payoutThresholdCents,
      currency: developer.currency,
    });
  });

  app.patch("/api/v1/developers/:id/preferences", { preHandler: requireSession }, async (req, reply) => {
    const params = ParamsSchema.safeParse(req.params);
    const body = PreferencesSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_request" });

    const developer = await loadOwnedDeveloper(req, reply, params.data.id);
    if (!developer) return;

    const updated = await prisma.developerProfile.update({
      where: { id: params.data.id },
      data: body.data,
    });

    return reply.send({
      adsEnabled: updated.adsEnabled,
      frequencyCapOverride: updated.frequencyCapOverride,
      preferredCategories: updated.preferredCategories,
    });
  });

  // GDPR-style data export + account deletion.
  app.get("/api/v1/developers/:id/export", { preHandler: requireSession }, async (req, reply) => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const owned = await loadOwnedDeveloper(req, reply, params.data.id);
    if (!owned) return;

    const developer = await prisma.developerProfile.findUnique({
      where: { id: params.data.id },
      include: {
        earningsLedger: true,
        payouts: true,
        impressions: { select: { id: true, campaignId: true, command: true, createdAt: true } },
        events: { select: { id: true, type: true, createdAt: true } },
      },
    });

    return reply.send(developer);
  });

  app.delete("/api/v1/developers/:id", { preHandler: requireSession }, async (req, reply) => {
    const params = ParamsSchema.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const developer = await loadOwnedDeveloper(req, reply, params.data.id);
    if (!developer) return;

    // Deleting the User cascades to DeveloperProfile and everything under
    // it (privacy consents, client installations, impressions, events,
    // earnings ledger, payouts) per the schema's onDelete: Cascade.
    await prisma.user.delete({ where: { id: developer.userId } });

    return reply.send({ ok: true });
  });
}
