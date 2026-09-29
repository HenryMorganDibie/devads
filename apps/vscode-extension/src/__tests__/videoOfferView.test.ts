import { describe, expect, it } from "vitest";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import { isPlayableCreativeUrl, playableCreative, renderVideoOfferHtml } from "../videoOfferView";

const offer = (overrides: Partial<SponsoredOpportunity> = {}): SponsoredOpportunity => ({
  displayEventId: "disp_1",
  offerId: "offer_1",
  campaignId: "camp_1",
  title: "DevAds Beta Opportunity: <Schema-Watch>",
  description: "Catches breaking API changes & more",
  ctaUrl: "https://devads-app.vercel.app/beta/opportunity/schema-watch?d=disp_1",
  requiredAction: "Open the project page from this offer, spend at least 15 seconds on it, then confirm",
  rewardType: "BETA_CREDITS",
  rewardAmountUnits: 25,
  expiresAt: null,
  campaignMode: "BETA",
  minEngagementSeconds: 15,
  presentationMode: "VIDEO",
  creative: {
    id: "cr_15",
    kind: "VIDEO",
    url: "https://devads-app.vercel.app/beta-creatives/schema-watch-15s.webm",
    mimeType: "video/webm",
    fallback: { url: "https://devads-app.vercel.app/beta-creatives/schema-watch-15s.mp4", mimeType: "video/mp4" },
    posterUrl: "https://devads-app.vercel.app/beta-creatives/schema-watch-15s.jpg",
    durationSeconds: 15,
    width: 1280,
    height: 720,
  },
  ...overrides,
});

describe("video offer presentation", () => {
  it("only plays https media, or http on localhost for development", () => {
    expect(isPlayableCreativeUrl("https://cdn.example/v.mp4")).toBe(true);
    expect(isPlayableCreativeUrl("http://localhost:3000/v.mp4")).toBe(true);
    expect(isPlayableCreativeUrl("http://cdn.example/v.mp4")).toBe(false);
    expect(isPlayableCreativeUrl("javascript:alert(1)")).toBe(false);
    expect(isPlayableCreativeUrl("file:///etc/passwd")).toBe(false);
  });

  it("presents video only for VIDEO offers that carry a playable creative", () => {
    expect(playableCreative(offer())?.durationSeconds).toBe(15);
    expect(playableCreative(offer({ presentationMode: "CARD" }))).toBeNull();
    expect(playableCreative(offer({ creative: null }))).toBeNull();
    expect(playableCreative(offer({ creative: { ...offer().creative!, url: "http://evil.example/v.mp4" } }))).toBeNull();
    expect(
      playableCreative(offer({ creative: { ...offer().creative!, fallback: { url: "javascript:alert(1)", mimeType: "video/mp4" } } }))
    ).toBeNull();
  });

  it("renders the server's creative under a strict CSP, escaped, and labelled first-party", () => {
    const html = renderVideoOfferHtml(offer(), "NONCE", "vscode-resource:");
    expect(html).toContain("media-src https://devads-app.vercel.app;");
    expect(html).toContain("default-src 'none'");
    // WebM first (VS Code webviews cannot decode H.264), MP4 as the fallback.
    const webm = html.indexOf('<source src="https://devads-app.vercel.app/beta-creatives/schema-watch-15s.webm" type="video/webm"');
    const mp4 = html.indexOf('<source src="https://devads-app.vercel.app/beta-creatives/schema-watch-15s.mp4" type="video/mp4"');
    expect(webm).toBeGreaterThan(0);
    expect(mp4).toBeGreaterThan(webm);
    expect(html).toContain("autoplay muted playsinline");
    expect(html).toContain("DevAds Beta · First-party");
    expect(html).toContain("Not an external sponsor");
    expect(html).toContain("Watching the video does not earn anything");
    expect(html).toContain("&lt;Schema-Watch&gt;");
    expect(html).not.toContain("<Schema-Watch>");
  });

  it("labels a sponsor's (LIVE) video as sponsored, never as DevAds", () => {
    const html = renderVideoOfferHtml(offer({ campaignMode: "LIVE", rewardType: "API_CREDITS" }), "N", "x:");
    expect(html).toContain(">Sponsored<");
    expect(html).not.toContain("First-party");
  });
});
