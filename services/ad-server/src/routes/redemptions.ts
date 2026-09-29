import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, prisma, type RewardRedemption } from "@devads/database";
import {
  AdminCompleteRedemptionRequestSchema,
  AdminFailRedemptionRequestSchema,
  AdminRedemptionListRequestSchema,
  RedeemRewardRequestSchema,
  RewardTypeSchema,
  type AdminRedemptionListResponse,
  type AdminRewardRedemptionDTO,
  type RedeemRewardResponse,
  type RedemptionProvider,
  type RedemptionResult,
  type RewardRedemptionDTO,
  type RewardRedemptionListResponse,
} from "@devads/shared";
import { requireAdmin, requireSession } from "../lib/authGuard.js";
import { emitDomainEvent } from "../lib/domainEvents.js";
import { balancesFromLedgerGroups, rewardWalletLockKey } from "../lib/rewardBalance.js";

const WalletQuery = z.object({ developerId: z.string().min(1) });
const IdParams = z.object({ id: z.string().min(1) });

// Redemption moves value; keep it well below the global 300/min default.
const REDEEM_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: "1 minute" } };

const OPEN_STATUSES = ["PENDING", "PROCESSING"] as const;
const MAX_FAILURE_REASON = 200;

class RedemptionRejected extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

function toDTO(r: RewardRedemption): RewardRedemptionDTO {
  return {
    id: r.id,
    rewardType: r.rewardType,
    amountUnits: r.amountUnits,
    provider: r.provider,
    status: r.status,
    providerRef: r.providerRef,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

function toAdminDTO(r: RewardRedemption): AdminRewardRedemptionDTO {
  return { ...toDTO(r), developerId: r.developerId };
}

type Outcome = { status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; providerRef?: string; failureReason?: string };

/**
 * Moves an open (PENDING / PROCESSING) redemption to the provider's or
 * operator's outcome. Returns the redemption as it stands afterwards and
 * whether this call changed it.
 *
 *  - COMPLETED: the REDEEMED debit becomes APPROVED and is final.
 *  - FAILED:    the REDEEMED debit is marked REJECTED and a compensating
 *               APPROVED ADJUSTMENT credit of the same amount is appended,
 *               and the wallet cache is restored. The ledger is never
 *               edited in amount, and the (redemptionId, entryType) unique
 *               index makes a second refund impossible.
 *  - PENDING / PROCESSING: only the status and reference are recorded.
 *
 * Runs under the developer's wallet lock, and the status transition is a
 * conditional update, so a racing complete and fail cannot both apply.
 */
async function settleRedemption(redemptionId: string, outcome: Outcome): Promise<{ redemption: RewardRedemption; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.rewardRedemption.findUnique({ where: { id: redemptionId } });
    if (!current) throw new RedemptionRejected(404, "redemption_not_found");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rewardWalletLockKey(current.developerId)}))`;

    const providerRef = outcome.providerRef ? outcome.providerRef : undefined;
    const failureReason = outcome.failureReason ? outcome.failureReason.slice(0, MAX_FAILURE_REASON) : undefined;
    const now = new Date();

    const transitioned = await tx.rewardRedemption.updateMany({
      where: { id: redemptionId, status: { in: [...OPEN_STATUSES] } },
      data: {
        status: outcome.status,
        ...(providerRef !== undefined ? { providerRef } : {}),
        ...(outcome.status === "FAILED" ? { failureReason: failureReason ?? "failed" } : {}),
        ...(outcome.status === "COMPLETED" ? { completedAt: now } : {}),
      },
    });
    if (transitioned.count === 0) {
      return { redemption: current, changed: false };
    }

    if (outcome.status === "COMPLETED") {
      await tx.developerRewardLedger.updateMany({
        where: { redemptionId, entryType: "REDEEMED" },
        data: { status: "APPROVED" },
      });
    } else if (outcome.status === "FAILED") {
      await tx.developerRewardLedger.updateMany({
        where: { redemptionId, entryType: "REDEEMED" },
        data: { status: "REJECTED" },
      });
      await tx.developerRewardLedger.create({
        data: {
          developerId: current.developerId,
          rewardType: current.rewardType,
          redemptionId,
          entryType: "ADJUSTMENT",
          amountUnits: current.amountUnits,
          status: "APPROVED",
          description: "Redemption failed; units returned",
        },
      });
      await tx.developerRewardWallet.update({
        where: { developerId_rewardType: { developerId: current.developerId, rewardType: current.rewardType } },
        data: { availableUnits: { increment: current.amountUnits } },
      });
    }

    const redemption = await tx.rewardRedemption.findUniqueOrThrow({ where: { id: redemptionId } });
    return { redemption, changed: true };
  });
}

function emitSettled(redemption: RewardRedemption, actor: "provider" | "admin") {
  if (redemption.status === "COMPLETED" || redemption.status === "FAILED") {
    emitDomainEvent(redemption.status === "COMPLETED" ? "reward.redemption.completed" : "reward.redemption.failed", {
      redemptionId: redemption.id,
      developerId: redemption.developerId,
      rewardType: redemption.rewardType,
      amountUnits: redemption.amountUnits,
      provider: redemption.provider,
      actor,
    });
  }
}

export interface RedemptionRouteOptions {
  /** null = redemption disabled (no provider configured). */
  provider: RedemptionProvider | null;
}

/**
 * Reward redemption (sponsorship Phase 7). The developer chooses a reward
 * type and a number of units; everything else (provider, balance, status)
 * is server-side. See docs/redemption.md.
 */
export async function registerRedemptionRoutes(app: FastifyInstance, opts: RedemptionRouteOptions) {
  const provider = opts.provider;

  // DevAds beta credits are never redeemable, whatever provider is configured:
  // they are not cash and were never sponsor-funded.
  const isNeverRedeemable = (t: string) => t === "BETA_CREDITS";
  const redeemableTypes = () =>
    provider ? RewardTypeSchema.options.filter((t) => !isNeverRedeemable(t) && provider.supportsRewardType(t)) : [];

  async function ownedDeveloper(developerId: string, userId: string) {
    const developer = await prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!developer) throw new RedemptionRejected(404, "developer_not_found");
    if (developer.userId !== userId) throw new RedemptionRejected(403, "forbidden");
    return developer;
  }

  /**
   * POST /api/v1/wallet/redemptions
   *
   * 1. Under the developer's wallet lock: replay check on the idempotency
   *    key, balance recomputed from the ledger, then in the same transaction
   *    a PENDING redemption, its REDEEMED ledger debit and a conditional
   *    wallet-cache decrement (the cache's CHECK >= 0 is a second guard).
   * 2. The provider is called outside the transaction.
   * 3. Its result settles the redemption (settleRedemption above). A
   *    provider that throws is treated as FAILED, so the units come back.
   */
  app.post("/api/v1/wallet/redemptions", { preHandler: requireSession, config: REDEEM_RATE_LIMIT }, async (req, reply) => {
    const parsed = RedeemRewardRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { developerId, rewardType, amountUnits, idempotencyKey } = parsed.data;

    try {
      await ownedDeveloper(developerId, req.session!.sub);
      if (!provider) {
        emitDomainEvent("reward.redemption.rejected", { developerId, rewardType, reason: "redemption_disabled" });
        throw new RedemptionRejected(503, "redemption_disabled");
      }
      if (isNeverRedeemable(rewardType) || !provider.supportsRewardType(rewardType)) {
        throw new RedemptionRejected(400, "reward_type_not_redeemable");
      }

      const reserved = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rewardWalletLockKey(developerId)}))`;

        const existing = await tx.rewardRedemption.findUnique({
          where: { developerId_idempotencyKey: { developerId, idempotencyKey } },
        });
        if (existing) {
          if (existing.rewardType !== rewardType || existing.amountUnits !== amountUnits) {
            throw new RedemptionRejected(409, "idempotency_key_reused");
          }
          return { redemption: existing, replay: true as const };
        }

        const grouped = await tx.developerRewardLedger.groupBy({
          by: ["rewardType", "entryType", "status"],
          where: { developerId, rewardType },
          _sum: { amountUnits: true },
        });
        const availableUnits = balancesFromLedgerGroups(grouped).available.get(rewardType) ?? 0;
        if (availableUnits < amountUnits) {
          throw new RedemptionRejected(400, "insufficient_balance", { availableUnits });
        }

        const redemption = await tx.rewardRedemption.create({
          data: { developerId, rewardType, amountUnits, provider: provider.kind, status: "PENDING", idempotencyKey },
        });
        await tx.developerRewardLedger.create({
          data: {
            developerId,
            rewardType,
            redemptionId: redemption.id,
            entryType: "REDEEMED",
            amountUnits,
            status: "PENDING",
            description: "Reward redemption",
          },
        });
        const debited = await tx.developerRewardWallet.updateMany({
          where: { developerId, rewardType, availableUnits: { gte: amountUnits } },
          data: { availableUnits: { decrement: amountUnits } },
        });
        if (debited.count !== 1) {
          // The cache disagrees with the ledger; refuse rather than guess.
          throw new RedemptionRejected(409, "wallet_reconciliation_required");
        }
        return { redemption, replay: false as const };
      });

      if (reserved.replay) {
        return reply.send({ redemption: toDTO(reserved.redemption), idempotent: true } satisfies RedeemRewardResponse);
      }

      emitDomainEvent("reward.redemption.requested", {
        redemptionId: reserved.redemption.id,
        developerId,
        rewardType,
        amountUnits,
        provider: provider.kind,
      });

      let result: RedemptionResult;
      try {
        result = await provider.redeem({ redemptionId: reserved.redemption.id, developerId, rewardType, amountUnits });
      } catch {
        result = { providerRef: "", status: "FAILED", failureReason: "provider_error" };
      }

      const { redemption } = await settleRedemption(reserved.redemption.id, {
        status: result.status,
        providerRef: result.providerRef,
        failureReason: result.failureReason,
      });
      emitSettled(redemption, "provider");
      return reply.status(201).send({ redemption: toDTO(redemption), idempotent: false } satisfies RedeemRewardResponse);
    } catch (err) {
      if (err instanceof RedemptionRejected) {
        if (err.code === "insufficient_balance" || err.code === "idempotency_key_reused") {
          emitDomainEvent("reward.redemption.rejected", { developerId, rewardType, reason: err.code });
        }
        return reply.status(err.statusCode).send({ error: err.code, ...err.extra });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Same idempotency key raced in outside the lock window; the client retries and gets the replay.
        return reply.status(409).send({ error: "redemption_in_progress" });
      }
      throw err;
    }
  });

  /** GET /api/v1/wallet/redemptions?developerId=... : the developer's recent redemptions and whether redeeming is available. */
  app.get("/api/v1/wallet/redemptions", { preHandler: requireSession }, async (req, reply) => {
    const parsed = WalletQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    try {
      await ownedDeveloper(parsed.data.developerId, req.session!.sub);
    } catch (err) {
      if (err instanceof RedemptionRejected) return reply.status(err.statusCode).send({ error: err.code });
      throw err;
    }
    const rows = await prisma.rewardRedemption.findMany({
      where: { developerId: parsed.data.developerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return reply.send({
      redemptionEnabled: provider !== null,
      redeemableRewardTypes: redeemableTypes(),
      redemptions: rows.map(toDTO),
    } satisfies RewardRedemptionListResponse);
  });

  // --- Admin -----------------------------------------------------------------
  // Operators settle redemptions a provider left open (the MANUAL provider
  // always does). Available even when no provider is configured, so open
  // redemptions can still be closed out.

  app.get("/api/v1/admin/redemptions", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = AdminRedemptionListRequestSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const rows = await prisma.rewardRedemption.findMany({
      where: parsed.data.status ? { status: parsed.data.status } : {},
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    return reply.send({ redemptions: rows.map(toAdminDTO) } satisfies AdminRedemptionListResponse);
  });

  async function adminSettle(id: string, outcome: Outcome, reply: FastifyReply) {
    try {
      const { redemption, changed } = await settleRedemption(id, outcome);
      if (!changed) return reply.status(409).send({ error: "redemption_not_open", status: redemption.status });
      emitSettled(redemption, "admin");
      return reply.send({ redemption: toAdminDTO(redemption) });
    } catch (err) {
      if (err instanceof RedemptionRejected) return reply.status(err.statusCode).send({ error: err.code });
      throw err;
    }
  }

  app.post("/api/v1/admin/redemptions/:id/complete", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const body = AdminCompleteRedemptionRequestSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_request" });
    return adminSettle(params.data.id, { status: "COMPLETED", providerRef: body.data.providerRef ?? `manual_${randomUUID()}` }, reply);
  });

  app.post("/api/v1/admin/redemptions/:id/fail", { preHandler: requireAdmin }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const body = AdminFailRedemptionRequestSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "invalid_request" });
    return adminSettle(params.data.id, { status: "FAILED", failureReason: body.data.reason }, reply);
  });
}
