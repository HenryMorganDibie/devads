import { DevAdsError, type DevAdsClient, type SponsoredOpportunity } from "@devads/ad-sdk";
import { forgetWebSession, webSessionId } from "./beta";

/**
 * Where "Open" takes the developer. A same-site CTA (DevAds' own beta
 * walkthrough) gets the display and session ids so the walkthrough can
 * report the interaction against this exact display; any other CTA is
 * returned unchanged and opened externally.
 */
export function opportunityHref(
  offer: Pick<SponsoredOpportunity, "ctaUrl" | "displayEventId" | "minEngagementSeconds">,
  sessionId: string,
  origin: string
): { href: string; internal: boolean } {
  const url = new URL(offer.ctaUrl);
  if (url.origin !== origin) return { href: offer.ctaUrl, internal: false };
  url.searchParams.set("d", offer.displayEventId);
  url.searchParams.set("s", sessionId);
  if (offer.minEngagementSeconds) url.searchParams.set("m", String(offer.minEngagementSeconds));
  return { href: `${url.pathname}${url.search}`, internal: true };
}

export function isBetaOffer(offer: Pick<SponsoredOpportunity, "campaignMode">): boolean {
  return offer.campaignMode === "BETA";
}

const COMPLETION_MESSAGES: Record<string, string> = {
  engagement_too_short: "Spend a little longer on the walkthrough, then confirm again.",
  offer_not_opened: "Open the walkthrough from your dashboard first, then confirm completion.",
  developer_daily_cap_reached: "You've reached today's limit for this opportunity. Come back tomorrow.",
  developer_lifetime_cap_reached: "You've completed this opportunity the maximum number of times.",
  campaign_ended: "This opportunity has ended.",
  campaign_not_active: "This opportunity is not active right now.",
  offer_inactive: "This opportunity is not active right now.",
  offer_expired: "This opportunity has expired.",
  display_mismatch: "This link doesn't belong to your account. Open the opportunity from your dashboard.",
  session_mismatch: "This link doesn't belong to your account. Open the opportunity from your dashboard.",
};

export function completionErrorMessage(err: unknown): string {
  if (err instanceof DevAdsError && err.reason && COMPLETION_MESSAGES[err.reason]) return COMPLETION_MESSAGES[err.reason];
  if (err instanceof DevAdsError && err.code === "unauthenticated") return "Your session expired. Sign in again.";
  return "We couldn't verify that right now. Please try again.";
}

function isStaleSession(err: unknown): boolean {
  return err instanceof DevAdsError && err.code === "rejected" && (err.status === 403 || err.status === 409 || err.status === 404);
}

/** Requests an opportunity in this tab's WEB session, starting a fresh session once if the old one ended. */
export async function requestWebOpportunity(
  client: DevAdsClient
): Promise<{ offer: SponsoredOpportunity | null; sessionId: string }> {
  for (let attempt = 0; ; attempt++) {
    const sessionId = await webSessionId(client);
    try {
      const offer = await client.requestSponsoredOpportunity({ clientType: "WEB", sessionId });
      return { offer, sessionId };
    } catch (err) {
      if (attempt === 0 && isStaleSession(err)) {
        forgetWebSession();
        continue;
      }
      throw err;
    }
  }
}
