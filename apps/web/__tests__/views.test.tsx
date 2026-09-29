import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RewardWalletView } from "../components/RewardWalletView";
import { SponsorshipsView, type ActiveSponsorshipsState } from "../components/SponsorshipsView";
import { DeveloperNav } from "../components/DeveloperNav";
import {
  fetchActiveSponsorships,
  fetchSponsorshipStatus,
  formatEligibleClients,
  isActiveSponsorshipsResponse,
  isReceivableToday,
  type ActiveSponsorship,
} from "../lib/sponsorships";
import type { RewardWalletResponse } from "../lib/rewards";

const NOW = new Date("2026-09-29T12:00:00Z");

/** Markup with tags stripped and whitespace collapsed, for text assertions. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const populated: RewardWalletResponse = {
  developerId: "dev1",
  balances: [{ rewardType: "AI_CREDITS", availableUnits: 1240, pendingUnits: 50, ledgerAvailableUnits: 1240 }],
  recentLedger: [
    {
      id: "l1",
      rewardType: "AI_CREDITS",
      campaignId: "c1",
      entryType: "REDEEMED",
      amountUnits: 400,
      status: "APPROVED",
      createdAt: "2026-09-20T08:00:00Z",
    },
    {
      id: "l2",
      rewardType: "AI_CREDITS",
      campaignId: "c1",
      entryType: "EARNED",
      amountUnits: 680,
      status: "APPROVED",
      createdAt: "2026-09-02T08:00:00Z",
    },
  ],
};

describe("RewardWalletView", () => {
  it("renders the loading state", () => {
    expect(text(renderToStaticMarkup(<RewardWalletView state={{ status: "loading" }} now={NOW} />))).toContain(
      "Loading your reward wallet"
    );
  });

  it("renders an honest empty state for a new developer", () => {
    const out = text(
      renderToStaticMarkup(
        <RewardWalletView state={{ status: "ok", wallet: { developerId: "dev1", balances: [], recentLedger: [] } }} now={NOW} />
      )
    );
    expect(out).toContain("No rewards yet");
    expect(out).not.toContain("Available:");
  });

  it("renders the error state with a retry button", () => {
    const html = renderToStaticMarkup(
      <RewardWalletView state={{ status: "error", message: "We couldn't load your reward wallet." }} now={NOW} onRetry={vi.fn()} />
    );
    expect(text(html)).toContain("We couldn't load your reward wallet.");
    expect(html).toContain("Try again");
    expect(html).toContain('role="alert"');
  });

  it("asks an expired session to sign in again", () => {
    const html = renderToStaticMarkup(<RewardWalletView state={{ status: "unauthenticated" }} now={NOW} />);
    expect(html).toContain('href="/login"');
  });

  it("renders balances, the monthly summary and the ledger history", () => {
    const out = text(renderToStaticMarkup(<RewardWalletView state={{ status: "ok", wallet: populated }} now={NOW} />));
    expect(out).toContain("AI Credits");
    expect(out).toContain("Available: 1,240");
    expect(out).toContain("Pending: 50");
    expect(out).toContain("This month: +680 earned -400 redeemed");
    expect(out).toContain("2026-09-20 AI Credits Redeemed -400 Approved");
    expect(out).toContain("2026-09-02 AI Credits Earned +680 Approved");
    expect(out).toContain("Redeeming rewards isn't available yet");
  });
});

const ON = { status: "ok", sponsoredContentEnabled: true } as const;
const NO_OFFERS: ActiveSponsorshipsState = { status: "ok", sponsoredContentEnabled: true, offers: [] };

const liveOffers: ActiveSponsorship[] = [
  {
    offerId: "o1",
    campaignId: "c1",
    title: "Try the sandbox",
    description: "Spin up a hosted sandbox",
    ctaUrl: "https://sponsor.example/try",
    requiredAction: "Run one deploy",
    rewardType: "AI_CREDITS",
    rewardAmountUnits: 1500,
    expiresAt: "2026-10-31T00:00:00Z",
    eligibleClientTypes: ["VS_CODE"],
  },
  {
    offerId: "o2",
    campaignId: "c2",
    title: "Explore the API",
    description: "Make a first request",
    ctaUrl: "https://sponsor.example/api",
    requiredAction: null,
    rewardType: "API_CREDITS",
    rewardAmountUnits: 7,
    expiresAt: null,
    eligibleClientTypes: [],
  },
  {
    offerId: "o3",
    campaignId: "c3",
    title: "Agent-only offer",
    description: "For agents",
    ctaUrl: "https://sponsor.example/agent",
    requiredAction: null,
    rewardType: "TOOL_CREDITS",
    rewardAmountUnits: 20,
    expiresAt: null,
    eligibleClientTypes: ["CURSOR", "AIDER"],
  },
];

describe("SponsorshipsView", () => {
  it("labels sponsorships as sponsored and distinct from ads", () => {
    const out = text(renderToStaticMarkup(<SponsorshipsView state={ON} offers={NO_OFFERS} />));
    expect(out).toContain("Sponsored");
    expect(out).toContain("paid placements");
    expect(out).toContain("separate from the standard ads");
    expect(out).toMatch(/\bOn\./);
  });

  it("renders every active sponsorship from the listing, with its reward and where it's available", () => {
    const html = renderToStaticMarkup(
      <SponsorshipsView state={ON} offers={{ status: "ok", sponsoredContentEnabled: true, offers: liveOffers }} />
    );
    const out = text(html);
    expect(html.match(/data-offer-id=/g)).toHaveLength(3);
    expect(out).toContain("Try the sandbox");
    expect(out).toContain("Reward: 1,500 AI Credits");
    expect(out).toContain("To earn it: Run one deploy");
    expect(out).toContain("Available in: VS Code");
    expect(out).toContain("Ends 2026-10-31 (UTC)");
    expect(out).toContain("Explore the API");
    expect(out).toContain("Reward: 7 API Credits");
    expect(out).toContain("Available in: Any connected tool");
    expect(out).toContain("Available in: Cursor, Aider");
    // Only the offer restricted to unsupported tools carries the warning.
    expect(out.match(/Not available in a tool DevAds supports yet/g)).toHaveLength(1);
    expect(out).toContain("not an offer to complete here");
    expect(out).not.toContain("No sponsorships are active");
    // Listing isn't a display: the page never links out to the sponsor.
    expect(html).not.toContain("sponsor.example");
  });

  it("keeps an honest empty state when the listing is genuinely empty", () => {
    const out = text(renderToStaticMarkup(<SponsorshipsView state={ON} offers={NO_OFFERS} />));
    expect(out).toContain("No sponsorships are active for you right now.");
    expect(out).not.toContain("Reward:");
  });

  it("explains an empty list caused by sponsored content being off", () => {
    const html = renderToStaticMarkup(
      <SponsorshipsView
        state={{ status: "ok", sponsoredContentEnabled: false }}
        offers={{ status: "ok", sponsoredContentEnabled: false, offers: [] }}
      />
    );
    expect(text(html)).toContain("You won't receive sponsored offers");
    expect(text(html)).toContain("Sponsored content is off, so no sponsorships are listed for you.");
    expect(html).toContain('href="/dashboard"');
  });

  it("renders loading and error states without breaking the page", () => {
    const loading = text(
      renderToStaticMarkup(<SponsorshipsView state={{ status: "loading" }} offers={{ status: "loading" }} />)
    );
    expect(loading).toContain("Loading your sponsorship settings");
    expect(loading).toContain("Loading active sponsorships");

    const html = renderToStaticMarkup(
      <SponsorshipsView
        state={{ status: "error", message: "Boom." }}
        offers={{ status: "error", message: "Listing failed." }}
        onRetry={vi.fn()}
      />
    );
    const out = text(html);
    expect(out).toContain("Boom.");
    expect(out).toContain("Listing failed.");
    expect(html.match(/role="alert"/g)).toHaveLength(2);
    expect(out).toContain("Where offers appear");
  });

  it("shows the settings even when only the listing fails, and vice versa", () => {
    const listingDown = text(
      renderToStaticMarkup(<SponsorshipsView state={ON} offers={{ status: "error", message: "Listing failed." }} />)
    );
    expect(listingDown).toMatch(/\bOn\./);
    expect(listingDown).toContain("Listing failed.");

    const settingsDown = text(
      renderToStaticMarkup(
        <SponsorshipsView
          state={{ status: "error", message: "Settings failed." }}
          offers={{ status: "ok", sponsoredContentEnabled: true, offers: liveOffers }}
        />
      )
    );
    expect(settingsDown).toContain("Settings failed.");
    expect(settingsDown).toContain("Try the sandbox");
  });

  it("asks an expired session to sign in again in the listing", () => {
    const html = renderToStaticMarkup(<SponsorshipsView state={ON} offers={{ status: "unauthenticated" }} />);
    expect(text(html)).toContain("again to see active sponsorships");
    expect(html).toContain('href="/login"');
  });
});

describe("DeveloperNav", () => {
  it("links the developer pages and marks the current one", () => {
    const html = renderToStaticMarkup(<DeveloperNav current="rewards" />);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/sponsorships"');
    expect(html).not.toContain('href="/rewards"');
    expect(html).toContain('aria-current="page"');
    expect(text(html)).not.toMatch(/\bAds\b/);
  });
});

describe("fetchSponsorshipStatus", () => {
  it("reads the existing preferences route and never the offer-selection route", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { adsEnabled: false } });
    expect(await fetchSponsorshipStatus("dev1", get)).toEqual({ status: "ok", sponsoredContentEnabled: false });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/developers/dev1/preferences");
  });

  it("maps auth failures, server errors, bad bodies and network errors", async () => {
    const unauth = vi.fn().mockResolvedValue({ ok: false, status: 401, data: {} });
    expect(await fetchSponsorshipStatus("dev1", unauth)).toEqual({ status: "unauthenticated" });
    const server = vi.fn().mockResolvedValue({ ok: false, status: 500, data: {} });
    expect((await fetchSponsorshipStatus("dev1", server)).status).toBe("error");
    const bad = vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} });
    expect((await fetchSponsorshipStatus("dev1", bad)).status).toBe("error");
    const offline = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await fetchSponsorshipStatus("dev1", offline)).status).toBe("error");
  });
});

describe("fetchActiveSponsorships", () => {
  it("reads the read-only listing route (plural), never the offer-selection route", async () => {
    const body = { sponsoredContentEnabled: true, offers: liveOffers };
    const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: body });
    expect(await fetchActiveSponsorships(get)).toEqual({ status: "ok", sponsoredContentEnabled: true, offers: liveOffers });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/sponsorships/offers");
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/sponsorships/offer?"));
  });

  it("maps auth failures, server errors, malformed bodies and network errors", async () => {
    for (const status of [401, 403]) {
      const unauth = vi.fn().mockResolvedValue({ ok: false, status, data: {} });
      expect(await fetchActiveSponsorships(unauth)).toEqual({ status: "unauthenticated" });
    }
    const server = vi.fn().mockResolvedValue({ ok: false, status: 500, data: {} });
    expect((await fetchActiveSponsorships(server)).status).toBe("error");
    const bad = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { offers: "nope" } });
    expect((await fetchActiveSponsorships(bad)).status).toBe("error");
    const offline = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect((await fetchActiveSponsorships(offline)).status).toBe("error");
  });
});

describe("active sponsorship helpers", () => {
  it("checks the listing response structurally", () => {
    expect(isActiveSponsorshipsResponse({ sponsoredContentEnabled: true, offers: liveOffers })).toBe(true);
    expect(isActiveSponsorshipsResponse({ sponsoredContentEnabled: false, offers: [] })).toBe(true);
    const o = liveOffers[0]!;
    for (const bad of [
      { ...o, rewardAmountUnits: 1.5 },
      { ...o, rewardType: "DOGECOIN" },
      { ...o, eligibleClientTypes: ["NOTEPAD"] },
      { ...o, title: undefined },
      { ...o, expiresAt: 5 },
    ]) {
      expect(isActiveSponsorshipsResponse({ sponsoredContentEnabled: true, offers: [bad] })).toBe(false);
    }
    expect(isActiveSponsorshipsResponse({ offers: [] })).toBe(false);
    expect(isActiveSponsorshipsResponse(null)).toBe(false);
  });

  it("describes where an offer can be received", () => {
    expect(formatEligibleClients([])).toBe("Any connected tool");
    expect(formatEligibleClients(["VS_CODE", "CUSTOM_AGENT"])).toBe("VS Code, Custom agents");
    expect(isReceivableToday({ eligibleClientTypes: [] })).toBe(true);
    expect(isReceivableToday({ eligibleClientTypes: ["AIDER", "VS_CODE"] })).toBe(true);
    expect(isReceivableToday({ eligibleClientTypes: ["AIDER"] })).toBe(false);
  });
});
