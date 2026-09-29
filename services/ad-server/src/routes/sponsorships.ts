import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, prisma, type DevelopmentSession } from "@devads/database";
import {
  resolveCarry,
  SponsoredOfferRequestSchema,
  SponsorshipEventRequestSchema,
  StartDevelopmentSessionSchema,
  type DevelopmentSessionDTO,
  type RewardWalletResponse,
  type SponsoredOfferResponse,
  type SponsorshipEventResponse,
} from "@devads/shared";
import {
  developerRewardCapReached,
  selectSponsoredOffer,
  sponsorshipNotLiveReason,
  wouldExceedSponsorshipBudget,
  type SponsorshipNotLiveReason,
} from "@devads/targeting";
import { requireSession } from "../lib/authGuard.js";
import { balancesFromLedgerGroups, rewardWalletLockKey } from "../lib/rewardBalance.js";
import {
  loadDisplayHistory,
  loadRewardCounts,
  loadSponsorshipBudgetUsage,
  loadSponsorshipCandidates,
  toSponsorshipCandidate,
} from "../lib/sponsorshipCandidates.js";

const UNIQUE_VIOLATION = "P2002";
const MILLI_CENTS_PER_CENT = 1000;

/** Max OFFER_DISPLAYED per developer per campaign per UTC day when a campaign sets no frequencyCapPerDay. */
const DEFAULT_SPONSORSHIP_DISPLAY_CAP_PER_DAY = Number(process.env.SPONSORSHIP_DEFAULT_DAILY_DISPLAY_CAP ?? 5);

const IdParams = z.object({ id: z.string().min(1) });
const WalletQuery = z.object({ developerId: z.string().min(1) });

const NOT_LIVE_ERROR: Record<SponsorshipNotLiveReason, string> = {
  CAMPAIGN_NOT_APPROVED: "campaign_not_active",
  CAMPAIGN_NOT_STARTED: "campaign_not_started",
  CAMPAIGN_ENDED: "campaign_ended",
  OFFER_INACTIVE: "offer_inactive",
  OFFER_EXPIRED: "offer_expired",
};

/** Thrown inside the completion transaction to roll it back and return a 4xx. */
class CompletionRejected extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
  }
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

function toSessionDTO(s: DevelopmentSession): DevelopmentSessionDTO {
  return {
    id: s.id,
    clientType: s.clientType,
    clientVersion: s.clientVersion,
    activityCategory: s.activityCategory,
    status: s.status,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  };
}

/**
 * Developer-facing sponsorship routes: development sessions, server-
 * authoritative offer selection, interaction/completion reporting, and the
 * reward wallet.
 *
 * Same trust model as ads.ts / events.ts / earnings.ts:
 *  - The developer is always derived from the verified session, never from
 *    the request body.
 *  - OFFER_DISPLAYED is created server-side only (the analogue of an ad
 *    IMPRESSION); clients reference its server-issued eventId.
 *  - Reward amounts, reward types, charges, caps and liveness are always
 *    read from the database. Nothing money- or reward-related is accepted
 *    from the client; unknown body fields are stripped by the Zod schema and
 *    metadata is stored for analytics only.
 *  - Idempotency comes from DB unique constraints (sponsorship_events.event_id
 *    and developer_reward_ledger.sponsorship_event_id), not app-level checks.
 */
export async function registerSponsorshipRoutes(app: FastifyInstance) {
  // --- Development sessions ------------------------------------------------
  app.post("/api/v1/sessions", { preHandler: requireSession }, async (req, reply) => {
    const parsed = StartDevelopmentSessionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });

    const developer = await prisma.developerProfile.findUnique({ where: { userId: req.session!.sub } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    const session = await prisma.developmentSession.create({
      data: {
        developerId: developer.id,
        clientType: parsed.data.clientType,
        clientVersion: parsed.data.clientVersion,
        activityCategory: parsed.data.activityCategory,
        status: "ACTIVE",
      },
    });
    return reply.send(toSessionDTO(session));
  });

  app.post("/api/v1/sessions/:id/end", { preHandler: requireSession }, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.status(400).send({ error: "invalid_request" });

    const session = await prisma.developmentSession.findUnique({
      where: { id: params.data.id },
      include: { developer: true },
    });
    if (!session) return reply.status(404).send({ error: "session_not_found" });
    if (session.developer.userId !== req.session!.sub) return reply.status(403).send({ error: "forbidden" });

    // Idempotent: ending an already-ended session returns it unchanged.
    if (session.status === "ENDED") return reply.send(toSessionDTO(session));

    const updated = await prisma.developmentSession.update({
      where: { id: session.id },
      data: { status: "ENDED", endedAt: new Date() },
    });
    return reply.send(toSessionDTO(updated));
  });

  // --- Offer selection -----------------------------------------------------
  /**
   * GET /api/v1/sponsorships/offer?clientType=...&sessionId=...
   *
   * Re-derives everything server-side (opt-in, client eligibility, campaign
   * liveness, budget, developer reward caps, display frequency cap) via the
   * pure @devads/targeting pipeline, and if an offer is selected records the
   * authoritative OFFER_DISPLAYED event with a server-generated eventId.
   * When a sessionId is given, the session's clientType wins over the query.
   */
  app.get("/api/v1/sponsorships/offer", { preHandler: requireSession }, async (req, reply) => {
    const parsed = SponsoredOfferRequestSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });

    const developer = await prisma.developerProfile.findUnique({ where: { userId: req.session!.sub } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    let clientType = parsed.data.clientType;
    let sessionId: string | undefined;
    if (parsed.data.sessionId) {
      const session = await prisma.developmentSession.findUnique({ where: { id: parsed.data.sessionId } });
      if (!session || session.developerId !== developer.id) return reply.status(403).send({ error: "forbidden" });
      if (session.status !== "ACTIVE") return reply.status(409).send({ error: "session_ended" });
      clientType = session.clientType;
      sessionId = session.id;
    }
    if (!clientType) return reply.status(400).send({ error: "client_type_required" });

    const now = new Date();
    const candidates = await loadSponsorshipCandidates(now);
    const campaignIds = candidates.map((c) => c.campaignId);
    const [budgetByCampaignId, displayHistory, rewardCountsByCampaignId] = await Promise.all([
      loadSponsorshipBudgetUsage(campaignIds, now),
      loadDisplayHistory(developer.id, now),
      loadRewardCounts(developer.id, campaignIds, now),
    ]);

    const winner = selectSponsoredOffer({
      candidates,
      dev: {
        developerId: developer.id,
        // The developer's existing persisted opt-in to sponsored content in
        // their tools; a disabled developer never receives an offer even if
        // a client is buggy or out of date.
        enabled: developer.adsEnabled,
        clientType,
        categoriesOptOut: developer.categoriesOptOut,
      },
      displayHistory,
      budgetByCampaignId,
      rewardCountsByCampaignId,
      defaultFrequencyCapPerDay: DEFAULT_SPONSORSHIP_DISPLAY_CAP_PER_DAY,
      now,
    });

    if (!winner) {
      const empty: SponsoredOfferResponse = { offer: null };
      return reply.send(empty);
    }
    const offer = candidates.find((c) => c.offerId === winner.offerId)!.offer;

    const displayEventId = randomUUID();
    await prisma.sponsorshipEvent.create({
      data: {
        eventId: displayEventId,
        type: "OFFER_DISPLAYED",
        offerId: winner.offerId,
        campaignId: winner.campaignId,
        developerId: developer.id,
        sessionId,
        metadata: { clientType },
      },
    });

    const response: SponsoredOfferResponse = {
      offer: {
        displayEventId,
        offerId: offer.id,
        campaignId: winner.campaignId,
        title: offer.title,
        description: offer.description,
        ctaUrl: offer.ctaUrl,
        requiredAction: offer.requiredAction,
        rewardType: winner.rewardType as NonNullable<SponsoredOfferResponse["offer"]>["rewardType"],
        rewardAmountUnits: winner.rewardAmountUnits,
        expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
      },
    };
    return reply.send(response);
  });

  // --- Interaction / completion events -----------------------------------
  /**
   * POST /api/v1/sponsorships/events
   *
   * OFFER_SKIPPED / OFFER_OPENED / OFFER_INTERACTED are recorded (idempotent
   * on eventId) and have no economic effect.
   *
   * OFFER_COMPLETED grants the campaign-configured reward, at most once per
   * server-issued display, inside ONE transaction that:
   *   1. inserts the completion event (unique eventId -> replay is a no-op),
   *   2. UPDATEs the campaign's spendCarryMilliCents, which takes the
   *      campaign row lock (same technique as events.ts) so concurrent
   *      completions for a campaign serialize and every check below sees
   *      committed state,
   *   3. re-checks liveness and the developer's daily/lifetime reward caps
   *      under that lock (hard limits: rejection rolls everything back),
   *   4. resolves the milli-cent carry and writes sponsorship_campaign_spend
   *      unless the budget is already exhausted (SOFT cap, exactly like the
   *      ad system: the developer is still rewarded and the platform absorbs
   *      the race-condition overage instead of overcharging the sponsor),
   *   5. writes the EARNED ledger row keyed by the display eventId (unique ->
   *      a re-keyed completion for the same display can never double-reward),
   *   6. increments the (developer, rewardType) wallet cache.
   *
   * Rewards are granted directly as APPROVED into availableUnits in Phase 1
   * (no review/hold period exists yet); pendingUnits stays 0 and is the seam
   * for a future hold or fraud-review step.
   */
  app.post("/api/v1/sponsorships/events", { preHandler: requireSession }, async (req, reply) => {
    const parsed = SponsorshipEventRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;

    const developer = await prisma.developerProfile.findUnique({ where: { userId: req.session!.sub } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });

    const display = await prisma.sponsorshipEvent.findUnique({
      where: { eventId: body.displayEventId },
      include: { offer: true, campaign: true },
    });
    if (!display || display.type !== "OFFER_DISPLAYED" || display.developerId !== developer.id) {
      return reply.status(400).send({ error: "display_mismatch" });
    }

    let sessionId: string | null = display.sessionId;
    if (body.sessionId) {
      const session = await prisma.developmentSession.findUnique({ where: { id: body.sessionId } });
      if (!session || session.developerId !== developer.id) return reply.status(400).send({ error: "session_mismatch" });
      sessionId = session.id;
    }

    const eventData = {
      eventId: body.eventId,
      type: body.type,
      offerId: display.offerId,
      campaignId: display.campaignId,
      developerId: developer.id,
      sessionId,
      displayEventId: display.eventId,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    };

    if (body.type !== "OFFER_COMPLETED") {
      try {
        await prisma.sponsorshipEvent.create({ data: eventData });
      } catch (err) {
        if (isUniqueViolation(err)) return reply.send({ ok: true, idempotent: true } satisfies SponsorshipEventResponse);
        throw err;
      }
      return reply.send({ ok: true } satisfies SponsorshipEventResponse);
    }

    // Fast pre-check before any write. Authoritative re-check happens under
    // the row lock inside the transaction below.
    const now = new Date();
    const preReason = sponsorshipNotLiveReason(toSponsorshipCandidate(display.campaign, display.offer), now);
    if (preReason) return reply.status(409).send({ error: NOT_LIVE_ERROR[preReason] });

    try {
      const reward = await prisma.$transaction(async (tx) => {
        await tx.sponsorshipEvent.create({ data: eventData });

        // Row lock on the campaign for the rest of the transaction (see
        // events.ts). The charge per completion is whole cents today, so the
        // carry resolves with no remainder; it is still routed through the
        // same carry so fractional pricing can be added without a new model.
        const chargeMilliCents = display.campaign.sponsorChargeCents * MILLI_CENTS_PER_CENT;
        const campaign = await tx.sponsorshipCampaign.update({
          where: { id: display.campaignId },
          data: { spendCarryMilliCents: { increment: chargeMilliCents } },
        });
        const offer = await tx.sponsoredOffer.findUniqueOrThrow({ where: { id: display.offerId } });

        const reason = sponsorshipNotLiveReason(toSponsorshipCandidate(campaign, offer), now);
        if (reason) throw new CompletionRejected(409, NOT_LIVE_ERROR[reason]);

        const counts = (await loadRewardCounts(developer.id, [campaign.id], now, tx))[campaign.id];
        const cap = developerRewardCapReached(campaign, counts);
        if (cap === "DAILY") throw new CompletionRejected(409, "developer_daily_cap_reached");
        if (cap === "LIFETIME") throw new CompletionRejected(409, "developer_lifetime_cap_reached");

        const resolved = resolveCarry(0, campaign.spendCarryMilliCents);
        await tx.sponsorshipCampaign.update({
          where: { id: campaign.id },
          data: { spendCarryMilliCents: resolved.newCarryMilliCents },
        });
        if (resolved.wholeCents > 0) {
          const usage = (await loadSponsorshipBudgetUsage([campaign.id], now, tx))[campaign.id];
          // Soft cap: skip only the sponsor charge once budget is exhausted;
          // the developer's completion is still rewarded below.
          if (!wouldExceedSponsorshipBudget(campaign, usage, resolved.wholeCents)) {
            await tx.sponsorshipCampaignSpend.create({
              data: {
                campaignId: campaign.id,
                amountCents: resolved.wholeCents,
                currency: campaign.currency,
                reason: "SPONSORSHIP_COMPLETION",
              },
            });
          }
        }

        // Amount and type come ONLY from the campaign row read under lock.
        const amountUnits = campaign.rewardAmountUnits;
        await tx.developerRewardLedger.create({
          data: {
            developerId: developer.id,
            rewardType: campaign.rewardType,
            campaignId: campaign.id,
            sponsorshipEventId: display.eventId,
            entryType: "EARNED",
            amountUnits,
            status: "APPROVED",
            description: "Sponsored offer completion",
          },
        });

        // Native upsert so two first-ever rewards of the same type from
        // different campaigns can't race on creating the wallet row.
        await tx.$executeRaw`
          INSERT INTO "developer_reward_wallets" ("id", "developerId", "rewardType", "availableUnits", "pendingUnits", "updatedAt")
          VALUES (${randomUUID()}, ${developer.id}, ${campaign.rewardType}::"RewardType", ${amountUnits}, 0, NOW())
          ON CONFLICT ("developerId", "rewardType")
          DO UPDATE SET "availableUnits" = "developer_reward_wallets"."availableUnits" + EXCLUDED."availableUnits",
                        "updatedAt" = NOW()`;

        return { rewardType: campaign.rewardType, amountUnits, status: "APPROVED" as const };
      });

      return reply.send({ ok: true, rewarded: true, reward } satisfies SponsorshipEventResponse);
    } catch (err) {
      if (err instanceof CompletionRejected) return reply.status(err.statusCode).send({ error: err.code });
      // Either this exact eventId was already processed (replay/retry), or
      // this display was already rewarded via a different completion
      // eventId. Both are safe no-ops; the transaction rolled back entirely.
      if (isUniqueViolation(err)) return reply.send({ ok: true, idempotent: true } satisfies SponsorshipEventResponse);
      throw err;
    }
  });

  // --- Wallet ----------------------------------------------------------------
  /**
   * GET /api/v1/wallet?developerId=...
   *
   * Ownership-checked exactly like GET /api/v1/earnings. Returns the cached
   * wallet balance per reward type alongside the balance recomputed from the
   * ledger (the source of truth). Reads run under a per-developer advisory
   * lock (distinct key namespace from payouts) so a future redemption flow,
   * which must take the same lock, can never interleave with a balance read.
   */
  app.get("/api/v1/wallet", { preHandler: requireSession }, async (req, reply) => {
    const parsed = WalletQuery.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_request" });
    const { developerId } = parsed.data;

    const developer = await prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    if (developer.userId !== req.session!.sub) return reply.status(403).send({ error: "forbidden" });

    const { wallets, grouped, recent } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rewardWalletLockKey(developerId)}))`;
      const [wallets, grouped, recent] = await Promise.all([
        tx.developerRewardWallet.findMany({ where: { developerId } }),
        tx.developerRewardLedger.groupBy({
          by: ["rewardType", "entryType", "status"],
          where: { developerId },
          _sum: { amountUnits: true },
        }),
        tx.developerRewardLedger.findMany({ where: { developerId }, orderBy: { createdAt: "desc" }, take: 50 }),
      ]);
      return { wallets, grouped, recent };
    });

    // Ledger-derived balance (see lib/rewardBalance.ts for the rules).
    const { available: ledgerAvailable, pending: ledgerPending } = balancesFromLedgerGroups(grouped);

    const types = new Set<string>([...wallets.map((w) => w.rewardType), ...ledgerAvailable.keys(), ...ledgerPending.keys()]);
    const response: RewardWalletResponse = {
      developerId,
      balances: [...types].sort().map((rewardType) => {
        const w = wallets.find((x) => x.rewardType === rewardType);
        return {
          rewardType: rewardType as RewardWalletResponse["balances"][number]["rewardType"],
          availableUnits: w?.availableUnits ?? 0,
          pendingUnits: w?.pendingUnits ?? 0,
          ledgerAvailableUnits: ledgerAvailable.get(rewardType) ?? 0,
        };
      }),
      recentLedger: recent.map((e) => ({
        id: e.id,
        rewardType: e.rewardType,
        campaignId: e.campaignId,
        redemptionId: e.redemptionId,
        entryType: e.entryType,
        amountUnits: e.amountUnits,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
      })),
    };
    return reply.send(response);
  });
}
