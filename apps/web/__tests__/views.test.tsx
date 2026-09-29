import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RewardWalletView } from "../components/RewardWalletView";
import { SponsorshipsView } from "../components/SponsorshipsView";
import { DeveloperNav } from "../components/DeveloperNav";
import { fetchSponsorshipStatus } from "../lib/sponsorships";
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

describe("SponsorshipsView", () => {
  it("labels sponsorships as sponsored and distinct from ads", () => {
    const out = text(renderToStaticMarkup(<SponsorshipsView state={{ status: "ok", sponsoredContentEnabled: true }} />));
    expect(out).toContain("Sponsored");
    expect(out).toContain("paid placements");
    expect(out).toContain("separate from the standard ads");
    expect(out).toMatch(/\bOn\./);
  });

  it("shows an honest empty state instead of a fabricated catalog", () => {
    const out = text(renderToStaticMarkup(<SponsorshipsView state={{ status: "ok", sponsoredContentEnabled: true }} />));
    expect(out).toContain("There's no list of sponsorships to browse here yet.");
  });

  it("explains how to turn sponsored content back on when it is off", () => {
    const html = renderToStaticMarkup(<SponsorshipsView state={{ status: "ok", sponsoredContentEnabled: false }} />);
    expect(text(html)).toContain("You won't receive sponsored offers");
    expect(html).toContain('href="/dashboard"');
  });

  it("renders loading and error states without breaking the page", () => {
    expect(text(renderToStaticMarkup(<SponsorshipsView state={{ status: "loading" }} />))).toContain(
      "Loading your sponsorship settings"
    );
    const out = text(renderToStaticMarkup(<SponsorshipsView state={{ status: "error", message: "Boom." }} onRetry={vi.fn()} />));
    expect(out).toContain("Boom.");
    expect(out).toContain("Where offers appear");
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
