import { describe, expect, it, vi } from "vitest";
import { DevAdsError } from "@devads/ad-sdk";
import { AdClient } from "../adClient";
import { CommandTracker } from "../commandTracker";
import { isEligibleForAdRequest } from "../eligibility";
import { SponsoredOfferController } from "../sponsoredOffer";
import { SponsorshipSession } from "../sponsorshipSession";
import type { SponsorshipApi } from "../sponsorshipClient";

/**
 * The standard ad flow must behave identically whether the sponsorship path
 * works, fails, or is absent. This mirrors extension.ts's tick(): standard
 * flow first, then the sponsorship pass over the same trackers.
 */

function fakeClock(startMs: number) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function brokenSponsorshipClient(): SponsorshipApi {
  const fail = () => Promise.reject(new DevAdsError("network", "sponsorship API down"));
  return {
    startSession: vi.fn(fail),
    endSession: vi.fn(fail),
    requestSponsoredOpportunity: vi.fn(fail),
    reportOfferEvent: vi.fn(fail),
    completeQualifyingAction: vi.fn(fail),
    getWallet: vi.fn(fail),
  } as unknown as SponsorshipApi;
}

async function runTick(opts: { sponsorship: "absent" | "broken" | "throwing-factory" }) {
  const clock = fakeClock(0);
  const tracker = new CommandTracker(8000, clock.now);
  const fetchImpl = vi.fn().mockResolvedValue(
    jsonResponse({ ad: { impressionId: "imp_1", campaignId: "camp_1", eventId: "evt_1", headline: "Ad" } })
  );
  const adClient = new AdClient("http://localhost:4000", "token", fetchImpl as unknown as typeof fetch);

  const getClient =
    opts.sponsorship === "throwing-factory"
      ? () => {
          throw new Error("SDK exploded");
        }
      : () => brokenSponsorshipClient();
  const session = new SponsorshipSession(() => {
    try {
      return getClient();
    } catch {
      return null;
    }
  });
  const offers = new SponsoredOfferController({
    getClient,
    session,
    view: { show: vi.fn(), hide: vi.fn() },
    openExternal: vi.fn(),
  });

  tracker.onCommandStart("npm run build");
  if (opts.sponsorship !== "absent") offers.onCommandStart(tracker);
  clock.advance(9000);

  // --- standard flow, exactly as extension.ts tick() runs it ---
  const eligible = isEligibleForAdRequest(
    { enabled: true, minimumWaitSeconds: 8 },
    { isSignedIn: true, elapsedSeconds: tracker.elapsedSeconds(), alreadyRequestedForThisCommand: false, stillRunning: tracker.isStillRunning() }
  );
  const shouldRequest = eligible && tracker.shouldRequestAd();
  let ad = null;
  if (shouldRequest) {
    tracker.markAdRequested();
    ad = await adClient.selectAd({ developerId: "dev_1", elapsedSeconds: tracker.elapsedSeconds() });
  }

  // --- sponsorship pass ---
  if (opts.sponsorship !== "absent") {
    await session.start();
    await offers.maybeRequest(tracker, { enabled: true, minimumWaitSeconds: 8, isSignedIn: true, standardAdShowing: false });
  }

  return { ad, fetchImpl, tracker };
}

describe("standard ad flow is isolated from the sponsorship path", () => {
  it.each(["absent", "broken", "throwing-factory"] as const)(
    "selects and returns the standard ad the same way when sponsorship is %s",
    async (sponsorship) => {
      const { ad, fetchImpl, tracker } = await runTick({ sponsorship });
      expect(ad?.campaignId).toBe("camp_1");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4000/api/v1/ads/select", expect.objectContaining({ method: "POST" }));
      // The sponsorship pass reads the tracker but never changes its state.
      expect(tracker.isStillRunning()).toBe(true);
      expect(tracker.shouldRequestAd()).toBe(false); // marked by the standard flow only
      expect(tracker.currentCommand()).toBe("npm run build");
    }
  );

  it("the sponsorship pass does not consume the standard flow's once-per-command request", async () => {
    const clock = fakeClock(0);
    const tracker = new CommandTracker(8000, clock.now);
    const offers = new SponsoredOfferController({
      getClient: () => brokenSponsorshipClient(),
      session: { currentSessionId: () => null, start: async () => null, invalidate: () => {} },
      view: { show: vi.fn(), hide: vi.fn() },
      openExternal: vi.fn(),
    });
    tracker.onCommandStart("cargo build");
    clock.advance(9000);
    // Sponsorship runs first here, on purpose: the standard flow must still be eligible afterwards.
    await offers.maybeRequest(tracker, { enabled: true, minimumWaitSeconds: 8, isSignedIn: true, standardAdShowing: false });
    expect(tracker.shouldRequestAd()).toBe(true);
  });
});
