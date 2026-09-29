import { z } from "zod";
import {
  CampaignModeSchema,
  DevClientTypeSchema,
  DevSessionStatusSchema,
  RewardTypeSchema,
  SponsorshipEventTypeSchema,
} from "./sponsorship.js";

// ---------------------------------------------------------------------------
// Developer beta
//
// Identity: OAuth sign-in (the providers enabled in Supabase Auth) happens at
// Supabase; the ad-server verifies the Supabase access token with Supabase
// itself, maps the Supabase user id to one DevAds developer, and returns an
// ordinary DevAds session token. Everything downstream (API guards, wallet, extension device
// pairing) keeps using that one identity.
// ---------------------------------------------------------------------------

/** Bump when the beta terms change; developers accept a specific version. */
export const BETA_TERMS_VERSION = "2026-09-30";

export const OAuthExchangeRequestSchema = z.object({
  /** Supabase Auth access token from the browser session. Verified server-side with Supabase. */
  accessToken: z.string().min(20).max(8192),
});
export type OAuthExchangeRequest = z.infer<typeof OAuthExchangeRequestSchema>;

export const OAuthExchangeResponseSchema = z.object({
  token: z.string(),
  userId: z.string(),
  developerId: z.string(),
  /** True the first time this identity signs in (a DevAds account was created). */
  created: z.boolean(),
});
export type OAuthExchangeResponse = z.infer<typeof OAuthExchangeResponseSchema>;

export const ClientInstallationDTOSchema = z.object({
  platform: z.string().nullable(),
  extensionVersion: z.string().nullable(),
  lastSeenAt: z.string(),
});

export const DeveloperMeResponseSchema = z.object({
  developerId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  /** The developer's opt-in to sponsored experiences (the same switch the extension honours). */
  sponsorshipsEnabled: z.boolean(),
  betaJoinedAt: z.string().nullable(),
  betaTermsVersion: z.string().nullable(),
  /** The current terms; if it differs from betaTermsVersion the developer has not accepted it. */
  currentBetaTermsVersion: z.string(),
  /** VS Code (or other device-paired) installations signed in to this account. */
  clientInstallations: z.array(ClientInstallationDTOSchema),
});
export type DeveloperMeResponse = z.infer<typeof DeveloperMeResponseSchema>;

export const JoinBetaRequestSchema = z.object({
  acceptTerms: z.literal(true),
  termsVersion: z.literal(BETA_TERMS_VERSION),
});
export type JoinBetaRequest = z.infer<typeof JoinBetaRequestSchema>;

export const DevelopmentSessionListResponseSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      clientType: DevClientTypeSchema,
      clientVersion: z.string().nullable(),
      status: DevSessionStatusSchema,
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      interactions: z.number().int(),
    })
  ),
});
export type DevelopmentSessionListResponse = z.infer<typeof DevelopmentSessionListResponseSchema>;

export const SponsorshipHistoryResponseSchema = z.object({
  events: z.array(
    z.object({
      eventId: z.string(),
      type: SponsorshipEventTypeSchema,
      offerTitle: z.string(),
      campaignMode: CampaignModeSchema,
      rewardType: RewardTypeSchema,
      rewardAmountUnits: z.number().int(),
      createdAt: z.string(),
    })
  ),
});
export type SponsorshipHistoryResponse = z.infer<typeof SponsorshipHistoryResponseSchema>;
