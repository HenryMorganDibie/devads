/**
 * This extension's DevAds development session. The lifecycle (shared
 * in-flight start, failure tolerance, invalidation on a stale-session reply)
 * is the SDK's host-agnostic DevelopmentSessionManager; the extension only
 * decides when to start and end it (activation, sign-in/out, settings).
 */
export { DevelopmentSessionManager as SponsorshipSession } from "@devads/ad-sdk";
