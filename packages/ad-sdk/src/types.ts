import type { z } from "zod";
import type {
  ClientSponsorshipEventTypeSchema,
  DevClientTypeDTO,
  DevelopmentSessionDTO,
  RewardTypeDTO,
  RewardWalletResponse,
  SponsoredOfferCandidate,
  SponsorshipEventResponse,
} from "@devads/shared";

// ---------------------------------------------------------------------------
// Public SDK types.
//
// Every shape here is an alias of (or is built from) a DTO in
// @devads/shared/sponsorship.ts, which is the single source of truth for the
// wire contract. Nothing here is a Prisma type and nothing names a specific
// AI provider, editor or sponsor: the client type is just a value of the
// shared DevClientType enum.
// ---------------------------------------------------------------------------

/** Which tool the developer is using (VS_CODE, CLAUDE_CODE, CODEX, ... OTHER). */
export type DevClientType = DevClientTypeDTO;
export type RewardType = RewardTypeDTO;

export type DevelopmentSession = DevelopmentSessionDTO;
/** A server-selected sponsored offer. `displayEventId` is the server-issued id every later event must reference. */
export type SponsoredOpportunity = SponsoredOfferCandidate;
export type RewardWallet = RewardWalletResponse;

/** A value, or a (possibly async) function returning it, re-read on every call so token refresh/sign-out is picked up. */
export type ValueSource = string | (() => string | undefined | null | Promise<string | undefined | null>);

export interface DevAdsCredentials {
  /** Session bearer token from the existing device-auth / login flow (POST /api/v1/auth/device/poll). */
  token: ValueSource;
  /** Developer profile id returned alongside the token by the same flow. Needed only for getWallet(). */
  developerId?: ValueSource;
}

/**
 * Coarse session context. Deliberately closed: there is no field for source
 * code, prompts, model output, file paths, repository contents or secrets,
 * and any extra keys are stripped by the shared schema before sending.
 */
export interface SessionContext {
  clientType?: DevClientType;
  clientVersion?: string;
  /** Short coarse slug such as "testing" or "build" (validated by the shared schema). */
  activityCategory?: string;
}

export interface OpportunityContext {
  /** When given, the server uses the session's client type. */
  sessionId?: string;
  clientType?: DevClientType;
}

type ClientReportableEventType = z.infer<typeof ClientSponsorshipEventTypeSchema>;

/**
 * Non-economic interaction events a client may report. OFFER_DISPLAYED is
 * recorded by the server when it selects an offer and cannot be reported;
 * OFFER_COMPLETED goes through completeQualifyingAction().
 */
export type OfferInteractionType = Exclude<ClientReportableEventType, "OFFER_COMPLETED">;

export interface OfferEventInput {
  type: OfferInteractionType;
  /** The `displayEventId` of the SponsoredOpportunity being interacted with. */
  displayEventId: string;
  sessionId?: string;
  /** Idempotency key. Generated if omitted; pass the returned one back when retrying. */
  eventId?: string;
}

export interface QualifyingActionInput {
  /** The `displayEventId` of the SponsoredOpportunity whose required action was completed. */
  displayEventId: string;
  sessionId?: string;
  /** Idempotency key. Generated if omitted; pass the returned one back when retrying. */
  eventId?: string;
}

/** Server acknowledgement plus the eventId that was sent (reuse it to retry safely). */
export type OfferEventResult = SponsorshipEventResponse & { eventId: string };
