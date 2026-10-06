import type { z } from "zod";
import {
  DevelopmentSessionDTOSchema,
  RedeemRewardRequestSchema,
  RedeemRewardResponseSchema,
  RewardRedemptionListResponseSchema,
  RewardWalletResponseSchema,
  SponsoredOfferListRequestSchema,
  SponsoredOfferListResponseSchema,
  SponsoredOfferRequestSchema,
  SponsoredOfferResponseSchema,
  SponsorshipEventRequestSchema,
  SponsorshipEventResponseSchema,
  StartDevelopmentSessionSchema,
} from "@devads/shared";
import { DevAdsError } from "./errors.js";
import { ROUTES } from "./routes.js";
import { HttpTransport, type FetchLike } from "./transport.js";
import type {
  DevAdsCredentials,
  DevClientType,
  DevelopmentSession,
  OfferEventInput,
  OfferEventResult,
  OpportunityContext,
  OpportunityListFilter,
  QualifyingActionInput,
  RedeemRewardInput,
  RedeemRewardResult,
  RewardRedemptionList,
  RewardWallet,
  SessionContext,
  SponsoredOpportunity,
  SponsoredOpportunityList,
  ValueSource,
} from "./types.js";

export interface DevAdsClientOptions {
  /** Ad-server origin, e.g. "https://api.devads.example". */
  baseUrl: string;
  credentials: DevAdsCredentials;
  /** Default client type for startSession() / requestSponsoredOpportunity(). */
  clientType?: DevClientType;
  /** Default client version for startSession(). */
  clientVersion?: string;
  /** Defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Per-request timeout. Defaults to 4000ms. */
  timeoutMs?: number;
  /** Idempotency-key generator for events. Defaults to crypto.randomUUID(). */
  generateEventId?: () => string;
}

const INTERACTION_TYPES = new Set(["OFFER_SKIPPED", "OFFER_OPENED", "OFFER_INTERACTED"]);

async function resolveValue(source: ValueSource | undefined): Promise<string | undefined> {
  if (source === undefined) return undefined;
  const value = typeof source === "function" ? await source() : source;
  return value ? value : undefined;
}

function defaultEventId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c?.randomUUID) {
    throw new DevAdsError("invalid_request", "crypto.randomUUID is unavailable; pass `generateEventId` or an explicit eventId");
  }
  return c.randomUUID();
}

function validateRequest<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DevAdsError("invalid_request", `Invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}

/**
 * DevAds Protocol client: the stable boundary every DevAds client (editor
 * extension, CLI, agent adapter) integrates against. It speaks only the
 * shared sponsorship DTOs, sends only the coarse metadata those schemas
 * allow, validates every request before sending and every response before
 * returning it, and never makes an economic decision itself -- selection,
 * rewards, caps and budgets are all server-authoritative.
 *
 * Every method either resolves with a schema-validated value or rejects
 * with a DevAdsError; callers decide how to degrade.
 */
export class DevAdsClient {
  private readonly transport: HttpTransport;
  private readonly credentials: DevAdsCredentials;
  private readonly defaults: { clientType?: DevClientType; clientVersion?: string };
  private readonly generateEventId: () => string;

  constructor(options: DevAdsClientOptions) {
    this.transport = new HttpTransport({ baseUrl: options.baseUrl, fetch: options.fetch, timeoutMs: options.timeoutMs });
    this.credentials = options.credentials;
    this.defaults = { clientType: options.clientType, clientVersion: options.clientVersion };
    this.generateEventId = options.generateEventId ?? defaultEventId;
  }

  /** Opens a development session for the signed-in developer. */
  async startSession(context: SessionContext = {}): Promise<DevelopmentSession> {
    const body = validateRequest(StartDevelopmentSessionSchema, {
      clientType: context.clientType ?? this.defaults.clientType,
      clientVersion: context.clientVersion ?? this.defaults.clientVersion,
      activityCategory: context.activityCategory,
    });
    return this.call(ROUTES.startSession.method, ROUTES.startSession.path(), DevelopmentSessionDTOSchema, { body });
  }

  /** Ends a session. Idempotent server-side: ending an ended session returns it unchanged. */
  async endSession(sessionId: string): Promise<DevelopmentSession> {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new DevAdsError("invalid_request", "sessionId is required");
    }
    return this.call(ROUTES.endSession.method, ROUTES.endSession.path(sessionId), DevelopmentSessionDTOSchema);
  }

  /**
   * Asks the server whether a sponsored offer is available right now.
   * Resolves to null when none is (opted out, no eligible campaign, caps,
   * budget, ...). A non-null result has already been recorded server-side
   * as OFFER_DISPLAYED; report later interactions against its displayEventId.
   *
   * `interactionKind` says what gave the client this opportunity (a wait, a
   * developer request, ...). It is sent only when given; the server records
   * an omitted kind as WAIT. `availableSeconds` is sent only when given;
   * without it the server serves no VIDEO offer.
   */
  async requestSponsoredOpportunity(context: OpportunityContext = {}): Promise<SponsoredOpportunity | null> {
    const query = validateRequest(SponsoredOfferRequestSchema, {
      clientType: context.clientType ?? this.defaults.clientType,
      sessionId: context.sessionId,
      interactionKind: context.interactionKind,
      availableSeconds: context.availableSeconds,
    });
    if (!query.clientType && !query.sessionId) {
      throw new DevAdsError("invalid_request", "clientType or sessionId is required");
    }
    const res = await this.call(ROUTES.requestOffer.method, ROUTES.requestOffer.path(), SponsoredOfferResponseSchema, {
      query: {
        clientType: query.clientType,
        sessionId: query.sessionId,
        // The schema fills in the default; only send a kind the caller chose.
        interactionKind: context.interactionKind === undefined ? undefined : query.interactionKind,
        availableSeconds: query.availableSeconds === undefined ? undefined : String(query.availableSeconds),
      },
    });
    return res.offer;
  }

  /**
   * Lists the live sponsored offers the developer is currently eligible for,
   * for browsing. Read-only: unlike requestSponsoredOpportunity() it records
   * nothing server-side, spends no display cap and returns offers without a
   * displayEventId, so they cannot be reported or completed. The client type
   * defaults to the client's configured one; a client without one lists
   * offers for every client type. `offers` is always empty when the
   * developer has sponsored content turned off (`sponsoredContentEnabled`).
   */
  async listSponsoredOpportunities(filter: OpportunityListFilter = {}): Promise<SponsoredOpportunityList> {
    const query = validateRequest(SponsoredOfferListRequestSchema, {
      clientType: filter.clientType ?? this.defaults.clientType,
    });
    return this.call(ROUTES.listOffers.method, ROUTES.listOffers.path(), SponsoredOfferListResponseSchema, {
      query: { clientType: query.clientType },
    });
  }

  /** Reports a non-economic interaction (skipped / opened / interacted). Idempotent on eventId. */
  async reportOfferEvent(input: OfferEventInput): Promise<OfferEventResult> {
    if (!INTERACTION_TYPES.has(input.type)) {
      throw new DevAdsError(
        "invalid_request",
        `reportOfferEvent does not accept "${String(input.type)}"; OFFER_DISPLAYED is server-recorded and OFFER_COMPLETED uses completeQualifyingAction()`
      );
    }
    return this.sendEvent(input.type, input);
  }

  /**
   * Reports that the developer completed the offer's required action. The
   * server decides whether a reward is granted (at most once per display,
   * subject to caps and campaign liveness); the result's `rewarded` and
   * `reward` fields reflect that decision. Cap/liveness refusals reject with
   * DevAdsError code "rejected" and a `reason` such as
   * "developer_daily_cap_reached" or "campaign_ended".
   */
  async completeQualifyingAction(input: QualifyingActionInput): Promise<OfferEventResult> {
    return this.sendEvent("OFFER_COMPLETED", input);
  }

  /** Reward balances and recent ledger entries for the signed-in developer. */
  async getWallet(developerId?: string): Promise<RewardWallet> {
    const id = developerId ?? (await resolveValue(this.credentials.developerId));
    if (!id) throw new DevAdsError("invalid_request", "developerId is required (pass it or set credentials.developerId)");
    return this.call(ROUTES.wallet.method, ROUTES.wallet.path(), RewardWalletResponseSchema, { query: { developerId: id } });
  }

  /**
   * The developer's recent redemptions, and whether redemption is enabled on
   * this server (and for which reward types). Read-only.
   */
  async listRedemptions(developerId?: string): Promise<RewardRedemptionList> {
    const id = await this.developerIdOrThrow(developerId);
    return this.call(ROUTES.listRedemptions.method, ROUTES.listRedemptions.path(), RewardRedemptionListResponseSchema, {
      query: { developerId: id },
    });
  }

  /**
   * Asks the server to redeem wallet units. The server checks the balance,
   * picks the provider and decides the outcome: the redemption may come back
   * COMPLETED, PENDING (an operator fulfils it later) or FAILED (the units
   * are returned). A retry with the same idempotencyKey returns the original
   * redemption with `idempotent: true` and debits nothing. Refusals reject
   * with DevAdsError code "rejected" and a `reason` such as
   * "insufficient_balance", "redemption_disabled" or "reward_type_not_redeemable".
   */
  async redeemReward(input: RedeemRewardInput): Promise<RedeemRewardResult> {
    const developerId = await this.developerIdOrThrow(input.developerId);
    const body = validateRequest(RedeemRewardRequestSchema, {
      developerId,
      rewardType: input.rewardType,
      amountUnits: input.amountUnits,
      idempotencyKey: input.idempotencyKey ?? this.generateEventId(),
    });
    const res = await this.call(ROUTES.redeem.method, ROUTES.redeem.path(), RedeemRewardResponseSchema, { body });
    return { ...res, idempotencyKey: body.idempotencyKey };
  }

  // -------------------------------------------------------------------------

  private async developerIdOrThrow(developerId?: string): Promise<string> {
    const id = developerId ?? (await resolveValue(this.credentials.developerId));
    if (!id) throw new DevAdsError("invalid_request", "developerId is required (pass it or set credentials.developerId)");
    return id;
  }

  private async sendEvent(
    type: "OFFER_SKIPPED" | "OFFER_OPENED" | "OFFER_INTERACTED" | "OFFER_COMPLETED",
    input: { displayEventId: string; sessionId?: string; eventId?: string }
  ): Promise<OfferEventResult> {
    const body = validateRequest(SponsorshipEventRequestSchema, {
      eventId: input.eventId ?? this.generateEventId(),
      type,
      displayEventId: input.displayEventId,
      sessionId: input.sessionId,
    });
    const res = await this.call(ROUTES.reportEvent.method, ROUTES.reportEvent.path(), SponsorshipEventResponseSchema, {
      body,
    });
    return { ...res, eventId: body.eventId };
  }

  private async call<S extends z.ZodTypeAny>(
    method: "GET" | "POST",
    path: string,
    responseSchema: S,
    extra: { query?: Record<string, string | undefined>; body?: unknown } = {}
  ): Promise<z.infer<S>> {
    const token = await resolveValue(this.credentials.token);
    if (!token) throw new DevAdsError("unauthenticated", "No DevAds session token; sign in first");

    const res = await this.transport.send({ method, path, token, ...extra });

    if (!res.ok) {
      const reason =
        res.body && typeof res.body === "object" && typeof (res.body as { error?: unknown }).error === "string"
          ? (res.body as { error: string }).error
          : undefined;
      throw new DevAdsError("rejected", `Server rejected request (${res.status}${reason ? `: ${reason}` : ""})`, {
        status: res.status,
        reason,
      });
    }

    const parsed = responseSchema.safeParse(res.body);
    if (!parsed.success) {
      throw new DevAdsError("invalid_response", "Server response did not match the DevAds protocol schema", {
        status: res.status,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}
