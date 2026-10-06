// DevAds Protocol SDK -- public entry point.
//
// Exposes the client, its option/input/result types (all built from the
// @devads/shared sponsorship DTOs), the error type, and the host-agnostic
// adapter runtime. The route table and HTTP transport are internal and
// intentionally not exported.

import { DevClientTypeSchema, QualifyingInteractionKindSchema } from "@devads/shared";
import type { DevClientType, QualifyingInteractionKind } from "./types.js";

export { DevAdsClient, type DevAdsClientOptions } from "./client.js";
export { DevAdsError, isDevAdsError, type DevAdsErrorCode } from "./errors.js";
export * from "./adapter/index.js";
export type { FetchLike, FetchLikeInit, FetchLikeResponse } from "./transport.js";
export type {
  DevAdsCredentials,
  DevClientType,
  DevelopmentSession,
  OfferCreative,
  OfferEventInput,
  OfferEventResult,
  OfferInteractionType,
  OpportunityContext,
  OpportunityListFilter,
  PresentationMode,
  QualifyingActionInput,
  QualifyingInteractionKind,
  RedeemRewardInput,
  RedeemRewardResult,
  RewardRedemption,
  RewardRedemptionList,
  RewardType,
  RewardWallet,
  SessionContext,
  SponsoredOpportunity,
  SponsoredOpportunityList,
  SponsoredOpportunityListing,
  ValueSource,
} from "./types.js";

/** All client types the protocol recognises, from the shared DevClientType enum. */
export const DEV_CLIENT_TYPES: readonly DevClientType[] = DevClientTypeSchema.options;

/** All qualifying interaction kinds the protocol recognises, from the shared enum. */
export const QUALIFYING_INTERACTION_KINDS: readonly QualifyingInteractionKind[] = QualifyingInteractionKindSchema.options;
