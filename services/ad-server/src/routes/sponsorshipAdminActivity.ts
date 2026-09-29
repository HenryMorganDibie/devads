import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@devads/database";
import {
  AdminActivityPageQuerySchema,
  AdminSponsorshipEventsQuerySchema,
  type AdminSponsorshipEventsPage,
  type AdminSponsorshipRewardsPage,
} from "@devads/shared";
import { requireAdmin } from "../lib/authGuard.js";

const IdParams = z.object({ id: z.string().min(1) });

// ---------------------------------------------------------------------------
// Keyset pagination
//
// No admin route had pagination before this, so the scheme is chosen here:
// newest first, ordered by (createdAt desc, id desc), `limit` rows per page
// (default 50, max 200) and an opaque `cursor` naming the last row of the
// previous page. Unlike offset paging it stays stable while new events keep
// arriving: a page never repeats or skips a row because rows were inserted
// in front of it. Prisma DateTime columns are timestamp(3), so the ISO
// millisecond timestamp in the cursor is exact.
// ---------------------------------------------------------------------------

interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const sep = decoded.indexOf("|");
  if (sep <= 0) return null;
  const createdAt = new Date(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

/** Rows strictly after the cursor in (createdAt desc, id desc) order. */
function afterCursor(cursor: Cursor | null) {
  if (!cursor) return {};
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}

const ORDER = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/** Fetches limit + 1 rows; the extra row only signals that another page exists. */
function toPage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return { pageRows, nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null };
}

async function campaignExists(id: string): Promise<boolean> {
  return (await prisma.sponsorshipCampaign.count({ where: { id } })) > 0;
}


/**
 * Admin, read-only views of sponsorship activity for fraud and abuse review.
 *
 *   GET /api/v1/admin/sponsorship-campaigns/:id/events   SponsorshipEvent rows
 *   GET /api/v1/admin/sponsorship-campaigns/:id/rewards  DeveloperRewardLedger rows
 *
 * Both are requireAdmin, like every other /api/v1/admin route. Handlers only
 * count/findMany: no SponsorshipEvent, spend, ledger, wallet or campaign row
 * is created or changed, and no cap is consumed. Rows are scoped by the
 * campaignId column the event and ledger writers set (the same column the
 * campaign stats count), so one campaign's view never returns another's
 * rows. The DTOs are explicit: event `metadata` and the ledger `description`
 * are never selected, and developers appear only by id.
 */
export async function registerSponsorshipAdminActivityRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/sponsorship-campaigns/:id/events", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const query = AdminSponsorshipEventsQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: "invalid_request" });
    const { limit, developerId, type } = query.data;
    const cursor = query.data.cursor === undefined ? null : decodeCursor(query.data.cursor);
    if (query.data.cursor !== undefined && !cursor) return reply.status(400).send({ error: "invalid_cursor" });

    if (!(await campaignExists(params.data.id))) return reply.status(404).send({ error: "campaign_not_found" });

    const where: Prisma.SponsorshipEventWhereInput = {
      campaignId: params.data.id,
      ...(developerId ? { developerId } : {}),
      ...(type ? { type } : {}),
      ...afterCursor(cursor),
    };
    const rows = await prisma.sponsorshipEvent.findMany({
      where,
      orderBy: ORDER,
      take: limit + 1,
      select: {
        id: true,
        eventId: true,
        type: true,
        offerId: true,
        developerId: true,
        sessionId: true,
        displayEventId: true,
        createdAt: true,
      },
    });

    const { pageRows, nextCursor } = toPage(rows, limit);
    const page: AdminSponsorshipEventsPage = {
      items: pageRows.map((e) => ({
        eventId: e.eventId,
        type: e.type,
        offerId: e.offerId,
        developerId: e.developerId,
        sessionId: e.sessionId,
        displayEventId: e.displayEventId,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor,
    };
    return reply.send(page);
  });

  app.get("/api/v1/admin/sponsorship-campaigns/:id/rewards", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const query = AdminActivityPageQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) return reply.status(400).send({ error: "invalid_request" });
    const { limit, developerId } = query.data;
    const cursor = query.data.cursor === undefined ? null : decodeCursor(query.data.cursor);
    if (query.data.cursor !== undefined && !cursor) return reply.status(400).send({ error: "invalid_cursor" });

    if (!(await campaignExists(params.data.id))) return reply.status(404).send({ error: "campaign_not_found" });

    const where: Prisma.DeveloperRewardLedgerWhereInput = {
      campaignId: params.data.id,
      ...(developerId ? { developerId } : {}),
      ...afterCursor(cursor),
    };
    const rows = await prisma.developerRewardLedger.findMany({
      where,
      orderBy: ORDER,
      take: limit + 1,
      select: {
        id: true,
        developerId: true,
        rewardType: true,
        campaignId: true,
        sponsorshipEventId: true,
        entryType: true,
        amountUnits: true,
        status: true,
        createdAt: true,
      },
    });

    const { pageRows, nextCursor } = toPage(rows, limit);
    const page: AdminSponsorshipRewardsPage = {
      items: pageRows.map((r) => ({
        id: r.id,
        developerId: r.developerId,
        rewardType: r.rewardType,
        campaignId: r.campaignId,
        sponsorshipEventId: r.sponsorshipEventId,
        entryType: r.entryType,
        amountUnits: r.amountUnits,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor,
    };
    return reply.send(page);
  });
}
