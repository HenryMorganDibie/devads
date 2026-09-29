import { randomUUID } from "node:crypto";
import { DevAdsClient, describeError, isStaleSessionError, type FetchLike } from "@devads/ad-sdk";

/**
 * The slice of the DevAds Protocol client the extension uses. Declared as a
 * Pick so the sponsorship modules depend on the SDK's method signatures
 * without depending on how the client is constructed (and so tests can pass
 * a plain object of mocks).
 */
export type SponsorshipApi = Pick<
  DevAdsClient,
  | "startSession"
  | "endSession"
  | "requestSponsoredOpportunity"
  | "reportOfferEvent"
  | "completeQualifyingAction"
  | "getWallet"
>;

/** This extension's value of the shared DevClientType enum. */
export const SPONSORSHIP_CLIENT_TYPE = "VS_CODE" as const;

/** The shared StartDevelopmentSession schema caps clientVersion at 32 chars. */
const MAX_CLIENT_VERSION_LENGTH = 32;

export interface SponsorshipClientConfig {
  adServerUrl: string;
  /** The extension's own version, from its package.json. */
  extensionVersion: string | undefined;
  /** Existing device-auth session token (SecretStorage). Re-read on every call. */
  getToken: () => string | undefined | Promise<string | undefined>;
  /** Existing developer id stored by the device-auth flow. Only used by getWallet(). */
  getDeveloperId: () => string | undefined;
  /** Test seam; defaults to the extension host's global fetch. */
  fetch?: FetchLike;
}

/**
 * Builds the SDK client for this extension. Auth is the existing device-auth
 * session token, passed as a provider so sign-in / sign-out is picked up
 * without rebuilding the client. Returns null instead of throwing if the SDK
 * cannot be constructed (e.g. no fetch in the host): sponsorship is optional
 * and must never break activation or the standard ad flow.
 */
export function createSponsorshipClient(config: SponsorshipClientConfig): SponsorshipApi | null {
  try {
    return new DevAdsClient({
      baseUrl: config.adServerUrl,
      credentials: {
        token: () => config.getToken(),
        developerId: () => config.getDeveloperId(),
      },
      clientType: SPONSORSHIP_CLIENT_TYPE,
      clientVersion: config.extensionVersion ? config.extensionVersion.slice(0, MAX_CLIENT_VERSION_LENGTH) : undefined,
      fetch: config.fetch,
      generateEventId: () => randomUUID(),
    });
  } catch {
    return null;
  }
}

/** Short, log-safe description of an SDK failure (code + server reason; never request contents). */
export const describeSponsorshipError = describeError;

/** Server reasons that mean the cached session id is no longer usable. */
export { isStaleSessionError };
