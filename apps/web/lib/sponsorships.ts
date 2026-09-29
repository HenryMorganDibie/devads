import { apiGet } from "./api";

// ---------------------------------------------------------------------------
// Developer-facing sponsorship status (Phase 4).
//
// The only developer-readable sponsorship data the API exposes without side
// effects is the developer's opt-in: Phase 1 reuses DeveloperProfile.adsEnabled
// as the single "show me sponsored content" switch, read here through the
// existing GET /api/v1/developers/:id/preferences route (the same call the
// dashboard makes).
//
// This page deliberately does NOT call GET /api/v1/sponsorships/offer. That
// route is a selection call, not a listing: every non-null response records a
// server-authoritative OFFER_DISPLAYED event, counts against the developer's
// per-campaign daily display cap and the sponsor's display stats, and
// requires a DevClientType (there is no web client type). There is no
// read-only "list active sponsorships" endpoint, so the page shows an honest
// empty state instead of a catalog.
// ---------------------------------------------------------------------------

export type SponsorshipStatusResult =
  | { status: "ok"; sponsoredContentEnabled: boolean }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type Getter = typeof apiGet;

export async function fetchSponsorshipStatus(developerId: string, get: Getter = apiGet): Promise<SponsorshipStatusResult> {
  try {
    const { ok, status, data } = await get<unknown>(
      `/api/v1/developers/${encodeURIComponent(developerId)}/preferences`
    );
    if (status === 401 || status === 403) return { status: "unauthenticated" };
    if (!ok) return { status: "error", message: "We couldn't load your sponsorship settings. Please try again." };
    const enabled = (data as { adsEnabled?: unknown } | null)?.adsEnabled;
    if (typeof enabled !== "boolean") {
      return { status: "error", message: "Your sponsorship settings came back in a format we couldn't read." };
    }
    return { status: "ok", sponsoredContentEnabled: enabled };
  } catch {
    return { status: "error", message: "We couldn't reach DevAds. Check your connection and try again." };
  }
}
