// DevAds Protocol SDK -- public entry point.
//
// Exposes the client, its option/input/result types (all built from the
// @devads/shared sponsorship DTOs), and the error type. The route table and
// HTTP transport are internal and intentionally not exported.

import { DevClientTypeSchema } from "@devads/shared";
import type { DevClientType } from "./types.js";

export { DevAdsClient, type DevAdsClientOptions } from "./client.js";
export { DevAdsError, isDevAdsError, type DevAdsErrorCode } from "./errors.js";
export type { FetchLike, FetchLikeInit, FetchLikeResponse } from "./transport.js";
export type {
  DevAdsCredentials,
  DevClientType,
  DevelopmentSession,
  OfferEventInput,
  OfferEventResult,
  OfferInteractionType,
  OpportunityContext,
  QualifyingActionInput,
  RewardType,
  RewardWallet,
  SessionContext,
  SponsoredOpportunity,
  ValueSource,
} from "./types.js";

/** All client types the protocol recognises, from the shared DevClientType enum. */
export const DEV_CLIENT_TYPES: readonly DevClientType[] = DevClientTypeSchema.options;
