import { describe, expect, it } from "vitest";
import { firstPartyOfferUrl } from "../index.js";

const offer = { ctaUrl: "https://devads-app.vercel.app/beta/opportunity", displayEventId: "disp-1", minEngagementSeconds: 15 };

describe("firstPartyOfferUrl", () => {
  it("adds the display, session and engagement ids to a CTA on the first-party origin", () => {
    expect(firstPartyOfferUrl(offer, "https://devads-app.vercel.app", "sess-1")?.toString()).toBe(
      "https://devads-app.vercel.app/beta/opportunity?d=disp-1&s=sess-1&m=15"
    );
  });

  it("accepts a configured base URL with a path or trailing slash", () => {
    expect(firstPartyOfferUrl(offer, "https://devads-app.vercel.app/", null)?.toString()).toBe(
      "https://devads-app.vercel.app/beta/opportunity?d=disp-1&m=15"
    );
  });

  it("returns null for third-party CTAs, a missing origin, or malformed URLs", () => {
    expect(firstPartyOfferUrl({ ...offer, ctaUrl: "https://sponsor.example/x" }, "https://devads-app.vercel.app")).toBeNull();
    expect(firstPartyOfferUrl({ ...offer, ctaUrl: "https://devads-app.vercel.app.evil.example/x" }, "https://devads-app.vercel.app")).toBeNull();
    expect(firstPartyOfferUrl(offer, undefined)).toBeNull();
    expect(firstPartyOfferUrl(offer, "not a url")).toBeNull();
    expect(firstPartyOfferUrl({ ...offer, ctaUrl: "/relative" }, "https://devads-app.vercel.app")).toBeNull();
  });
});
