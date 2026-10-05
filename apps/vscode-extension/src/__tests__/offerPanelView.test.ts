import { describe, expect, it } from "vitest";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import {
  attributionLabel,
  isPlayableCreativeUrl,
  panelPresentation,
  playableCreative,
  renderCardOfferHtml,
  renderOfferPanelHtml,
  renderVideoOfferHtml,
} from "../offerPanelView";

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

/** A plain sponsor (LIVE) CARD offer, as every offer was before video existed. */
const card = (overrides: Partial<SponsoredOpportunity> = {}): SponsoredOpportunity => ({
  displayEventId: "disp_c",
  offerId: "offer_c",
  campaignId: "camp_c",
  title: "Try <Acme> Cloud",
  description: "Deploy previews in one click & more",
  ctaUrl: "https://acme.example/devads?secret-token=abc",
  requiredAction: null,
  rewardType: "AI_CREDITS",
  rewardAmountUnits: 50,
  expiresAt: null,
  campaignMode: "LIVE",
  ...overrides,
});

const csp = (html: string) => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)![1];

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

  it("has a loading state until the first frame and an inline error state that keeps the offer usable", () => {
    const html = renderVideoOfferHtml(offer(), "NONCE", "x:");
    expect(html).toContain('id="media-status" role="status">Loading video...');
    expect(html).toContain('addEventListener("loadeddata"');
    expect(html).toContain("The video could not load. The offer details are below.");
    expect(html).toContain('vscode.postMessage({ type: "mediaError" })');
    // The offer content and both actions are in the page regardless of the media state.
    expect(html).toContain('id="open"');
    expect(html).toContain('id="skip"');
  });

  it("labels a sponsor's (LIVE) video as sponsored, never as DevAds", () => {
    const html = renderVideoOfferHtml(offer({ campaignMode: "LIVE", rewardType: "API_CREDITS" }), "N", "x:");
    expect(html).toContain(">Sponsored<");
    expect(html).not.toContain("First-party");
  });
});

describe("CARD offer presentation in the panel", () => {
  it("renders headline, body, reward line and call to action, escaped", () => {
    const html = renderCardOfferHtml(card(), "NONCE", "vscode-resource:");
    expect(html).toContain("<h1>Try &lt;Acme&gt; Cloud</h1>");
    expect(html).toContain("Deploy previews in one click &amp; more");
    expect(html).not.toContain("<Acme>");
    expect(html).toContain("Open the offer to earn 50 units (AI credits).");
    expect(html).toContain('<button class="primary" id="open">Open offer</button>');
    expect(html).toContain('<button class="secondary" id="skip">Skip</button>');
  });

  it("uses the same security posture as the video view, with no media allowed at all", () => {
    const html = renderCardOfferHtml(card(), "NONCE", "vscode-resource:");
    expect(csp(html)).toBe("default-src 'none'; img-src vscode-resource:; style-src 'nonce-NONCE'; script-src 'nonce-NONCE';");
    expect(html).not.toContain("<video");
    expect(html).toContain('<script nonce="NONCE">');
    expect(html).toContain('<style nonce="NONCE">');
    // Only the two action messages can be posted; the CTA URL never reaches the page.
    expect(html.match(/postMessage\(\{ type: "(\w+)" \}\)/g)).toEqual([
      'postMessage({ type: "open" })',
      'postMessage({ type: "skip" })',
    ]);
    expect(html).not.toContain("acme.example");
  });

  it("labels a sponsor's card as sponsored and a DevAds beta card as first-party", () => {
    const live = renderCardOfferHtml(card(), "N", "x:");
    expect(live).toContain('<span class="label">Sponsored</span>');
    expect(live).toContain("Sponsored content, shown because you opted in to sponsorships.");
    expect(live).not.toContain("DevAds Beta");

    const beta = renderCardOfferHtml(card({ campaignMode: "BETA", rewardType: "BETA_CREDITS", requiredAction: "Open the walkthrough" }), "N", "x:");
    expect(beta).toContain('<span class="label">DevAds Beta · First-party</span>');
    expect(beta).toContain("Not an external sponsor.");
    expect(beta).toContain("To earn 50 units (DevAds beta credits): Open the walkthrough.");
    expect(beta).not.toContain(">Sponsored<");
  });

  it("shares the attribution label with every surface", () => {
    expect(attributionLabel({ campaignMode: "BETA" })).toBe("DevAds Beta · First-party");
    expect(attributionLabel({ campaignMode: "LIVE" })).toBe("Sponsored");
    expect(attributionLabel({})).toBe("Sponsored");
  });
});

describe("renderOfferPanelHtml", () => {
  it("renders VIDEO only when video is allowed and the creative is playable, CARD otherwise", () => {
    expect(panelPresentation(offer(), true)).toBe("VIDEO");
    expect(panelPresentation(offer(), false)).toBe("CARD");
    expect(panelPresentation(offer({ creative: null }), true)).toBe("CARD");
    expect(panelPresentation(card(), true)).toBe("CARD");

    expect(renderOfferPanelHtml({ status: "offer", offer: offer(), videoAllowed: true }, "N", "x:")).toContain("<video");
    const disallowed = renderOfferPanelHtml({ status: "offer", offer: offer(), videoAllowed: false }, "N", "x:");
    expect(disallowed).not.toContain("<video");
    expect(csp(disallowed)).not.toContain("media-src");
    expect(disallowed).toContain("DevAds Beta · First-party");
  });

  it("never throws for an unplayable VIDEO offer: it falls back to the CARD rendering", () => {
    const broken = offer({ creative: { ...offer().creative!, url: "javascript:alert(1)" } });
    expect(() => renderVideoOfferHtml(broken, "N", "x:")).toThrow();
    const html = renderOfferPanelHtml({ status: "offer", offer: broken, videoAllowed: true }, "N", "x:");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('id="open"');
  });

  it("has an empty state with no actions and no media", () => {
    const html = renderOfferPanelHtml({ status: "empty" }, "N", "x:");
    expect(html).toContain("No sponsored opportunity right now");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<script");
    expect(csp(html)).toBe("default-src 'none'; img-src x:; style-src 'nonce-N'; script-src 'nonce-N';");
  });
});
