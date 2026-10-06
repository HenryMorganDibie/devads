import type { SponsoredOpportunity } from "../types.js";

/**
 * The link a client opens for an offer. A CTA on DevAds' own site (the
 * first-party beta walkthrough) carries the display id, the session id when
 * known, and the engagement minimum, so the walkthrough can report the open
 * and the completion against this exact server-issued display. Any other
 * CTA is returned unchanged, so no DevAds ids ever reach a third party.
 *
 * Returns null when the CTA is not on `firstPartyOrigin` (or either URL is
 * not absolute).
 */
export function firstPartyOfferUrl(
  offer: Pick<SponsoredOpportunity, "ctaUrl" | "displayEventId" | "minEngagementSeconds">,
  firstPartyOrigin: string | undefined,
  sessionId?: string | null
): URL | null {
  if (!firstPartyOrigin) return null;
  let url: URL;
  let origin: string;
  try {
    url = new URL(offer.ctaUrl);
    origin = new URL(firstPartyOrigin).origin;
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  url.searchParams.set("d", offer.displayEventId);
  if (sessionId) url.searchParams.set("s", sessionId);
  if (offer.minEngagementSeconds) url.searchParams.set("m", String(offer.minEngagementSeconds));
  return url;
}
