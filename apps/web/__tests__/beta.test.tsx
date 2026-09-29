import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DevAdsError } from "@devads/ad-sdk";
import { OAUTH_ERROR_MESSAGES, safeNext } from "../lib/beta";
import { completionErrorMessage, isBetaOffer, opportunityHref } from "../lib/betaOffer";
import { LINKS } from "../lib/site";
import { BetaTerms } from "../components/BetaTerms";
import { Hero } from "../components/marketing/Hero";
import AdvertisePage from "../app/advertise/page";
import { RewardWalletView } from "../components/RewardWalletView";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/app/wallet")).toBe("/app/wallet");
    expect(safeNext("/beta/opportunity?d=1&s=2")).toBe("/beta/opportunity?d=1&s=2");
    expect(safeNext("/device")).toBe("/device");
  });

  it("refuses anything that could leave the site", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "app", "", null, undefined]) {
      expect(safeNext(next)).toBe("/app");
    }
  });
});

describe("opportunityHref", () => {
  const offer = {
    ctaUrl: "https://devads-app.vercel.app/beta/opportunity",
    displayEventId: "disp-1",
    minEngagementSeconds: 15,
  };

  it("routes a same-site beta walkthrough internally with the display and session ids", () => {
    expect(opportunityHref(offer, "sess-1", "https://devads-app.vercel.app")).toEqual({
      href: "/beta/opportunity?d=disp-1&s=sess-1&m=15",
      internal: true,
    });
  });

  it("opens other destinations unchanged, without leaking ids to them", () => {
    const external = { ...offer, ctaUrl: "https://sponsor.example/offer?ref=x" };
    expect(opportunityHref(external, "sess-1", "https://devads-app.vercel.app")).toEqual({
      href: "https://sponsor.example/offer?ref=x",
      internal: false,
    });
  });
});

describe("beta offer presentation", () => {
  it("identifies DevAds-funded beta offers by campaign mode only", () => {
    expect(isBetaOffer({ campaignMode: "BETA" })).toBe(true);
    expect(isBetaOffer({ campaignMode: "LIVE" })).toBe(false);
    expect(isBetaOffer({ campaignMode: undefined })).toBe(false);
  });

  it("explains server verification failures instead of failing silently", () => {
    const rejected = (reason: string) => new DevAdsError("rejected", "x", { status: 409, reason });
    expect(completionErrorMessage(rejected("engagement_too_short"))).toMatch(/longer/);
    expect(completionErrorMessage(rejected("offer_not_opened"))).toMatch(/Open the walkthrough/);
    expect(completionErrorMessage(rejected("developer_lifetime_cap_reached"))).toMatch(/maximum/);
    expect(completionErrorMessage(new DevAdsError("unauthenticated", "x"))).toMatch(/Sign in/);
    expect(completionErrorMessage(new Error("boom"))).toMatch(/try again/);
  });

  it("has a message for every OAuth exchange refusal the server returns", () => {
    for (const code of [
      "email_in_use_by_another_account",
      "oauth_email_required",
      "oauth_provider_not_allowed",
      "oauth_not_configured",
      "invalid_oauth_token",
      "identity_provider_unavailable",
      "not_a_developer_account",
    ]) {
      expect(OAUTH_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});

describe("beta terms", () => {
  it("state that the beta is DevAds-funded and that Beta Credits are not cash", () => {
    const t = text(renderToStaticMarkup(<BetaTerms />));
    expect(t).toMatch(/no external sponsors/i);
    expect(t).toMatch(/not cash/);
    expect(t).toMatch(/cannot be redeemed/);
    expect(t).toMatch(/never collects source code, prompts, model responses or secrets/);
  });
});

describe("landing page", () => {
  it("leads with joining the developer beta and becoming a sponsor", () => {
    const html = renderToStaticMarkup(<Hero />);
    expect(LINKS.signUp).toBe("/join");
    expect(html).toContain('href="/join"');
    expect(html).toContain('href="/advertise"');
    const t = text(html);
    expect(t).toContain("Join the Developer Beta");
    expect(t).toContain("Become a Sponsor");
    expect(t).toMatch(/developer beta/i);
    expect(t).toMatch(/no external sponsors yet/);
  });

  it("never sends sponsors to a missing sponsor app", () => {
    const prev = process.env.NEXT_PUBLIC_ADVERTISER_APP_URL;
    delete process.env.NEXT_PUBLIC_ADVERTISER_APP_URL;
    try {
      const html = renderToStaticMarkup(<AdvertisePage />);
      expect(html).not.toContain("localhost");
      expect(text(html)).toMatch(/no external sponsors yet/);
      expect(html).toContain('href="/join"');
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_ADVERTISER_APP_URL = prev;
    }
  });
});

describe("beta wallet", () => {
  it("labels beta-funded credits as DevAds beta, not sponsor rewards", () => {
    const t = text(
      renderToStaticMarkup(
        <RewardWalletView
          now={new Date("2026-09-29T12:00:00Z")}
          state={{
            status: "ok",
            wallet: {
              developerId: "dev1",
              balances: [{ rewardType: "BETA_CREDITS", availableUnits: 50, pendingUnits: 0, ledgerAvailableUnits: 50 }],
              recentLedger: [
                {
                  id: "l1",
                  rewardType: "BETA_CREDITS",
                  campaignId: "devads-developer-beta",
                  entryType: "EARNED",
                  amountUnits: 50,
                  status: "APPROVED",
                  createdAt: "2026-09-29T10:00:00Z",
                  rewardSource: "DEVADS_BETA",
                },
              ],
            },
          }}
        />
      )
    );
    expect(t).toContain("Beta Credits · DevAds beta");
    expect(t).toMatch(/granted by DevAds during the developer beta, not by sponsors/);
    expect(t).not.toMatch(/granted by sponsors,/);
  });
});
