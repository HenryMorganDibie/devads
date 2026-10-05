import { describe, expect, it, vi } from "vitest";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import {
  OfferPresentationController,
  parsePresentationPreference,
  type OfferPanelEvents,
  type OfferPanelSurface,
  type PresentationPreference,
} from "../offerPresentation";
import { SponsoredOfferController } from "../sponsoredOffer";
import type { SponsorshipApi } from "../sponsorshipClient";

function offer(overrides: Partial<SponsoredOpportunity> = {}): SponsoredOpportunity {
  return {
    displayEventId: "disp_1",
    offerId: "offer_1",
    campaignId: "camp_1",
    title: "Try Acme Cloud",
    description: "Deploy previews in one click.",
    ctaUrl: "https://acme.example/devads",
    requiredAction: null,
    rewardType: "AI_CREDITS",
    rewardAmountUnits: 50,
    expiresAt: null,
    ...overrides,
  };
}

function fakePanel(opts: { showThrows?: boolean; staysOpenOnHide?: boolean } = {}) {
  let events: OfferPanelEvents | null = null;
  const panel = {
    show: vi.fn((_offer: SponsoredOpportunity, _o: { videoAllowed: boolean }) => {
      if (opts.showThrows) throw new Error("render failed");
    }),
    hide: vi.fn(() => Boolean(opts.staysOpenOnHide)),
    dispose: vi.fn(),
  } satisfies OfferPanelSurface;
  return { panel, closeByUser: () => events?.onClosedByUser(), bind: (e: OfferPanelEvents) => (events = e) };
}

function setup(opts: {
  preference?: PresentationPreference;
  videoAllowed?: boolean;
  createPanel?: (events: OfferPanelEvents) => OfferPanelSurface;
} = {}) {
  const statusBar = { show: vi.fn(), hide: vi.fn() };
  const fake = fakePanel();
  const createPanel = vi.fn(
    opts.createPanel ??
      ((events: OfferPanelEvents) => {
        fake.bind(events);
        return fake.panel;
      })
  );
  const pref = { value: opts.preference ?? ("panel" as PresentationPreference) };
  const log = vi.fn();
  const controller = new OfferPresentationController({
    statusBar,
    createPanel,
    preference: () => pref.value,
    videoAllowed: () => opts.videoAllowed ?? true,
    log,
  });
  return { statusBar, createPanel, fake, pref, log, controller };
}

describe("presentation setting", () => {
  it("defaults to the panel and only accepts statusBar as the alternative", () => {
    expect(parsePresentationPreference(undefined)).toBe("panel");
    expect(parsePresentationPreference("panel")).toBe("panel");
    expect(parsePresentationPreference("statusBar")).toBe("statusBar");
    expect(parsePresentationPreference("webview")).toBe("panel");
    expect(parsePresentationPreference(42)).toBe("panel");
  });
});

describe("panel mode: the DevAds panel presents any offer", () => {
  it("shows a CARD offer in the panel, not the status bar", () => {
    const { statusBar, fake, controller } = setup();
    controller.show(offer());
    expect(fake.panel.show).toHaveBeenCalledWith(offer(), { videoAllowed: true });
    expect(statusBar.show).not.toHaveBeenCalled();
    expect(controller.activeSurface()).toBe("panel");
  });

  it("passes the video setting to the panel, and opens a fresh panel after one that closed itself", () => {
    const { createPanel, fake, controller } = setup({ videoAllowed: false });
    controller.show(offer({ presentationMode: "VIDEO" }));
    controller.hide();
    controller.show(offer({ displayEventId: "disp_2" }));
    expect(fake.panel.show).toHaveBeenNthCalledWith(1, expect.anything(), { videoAllowed: false });
    // The fake panel closes itself on hide (it was not the active tab), so a new one is created.
    expect(createPanel).toHaveBeenCalledTimes(2);
  });

  it("keeps the panel when it stays open on its empty state, and hides both surfaces", () => {
    const fake = fakePanel({ staysOpenOnHide: true });
    const { statusBar, createPanel, controller } = setup({ createPanel: () => fake.panel });
    controller.show(offer());
    controller.hide();
    expect(fake.panel.hide).toHaveBeenCalled();
    expect(statusBar.hide).toHaveBeenCalled();
    expect(controller.activeSurface()).toBeNull();
    controller.show(offer({ displayEventId: "disp_2" }));
    expect(createPanel).toHaveBeenCalledTimes(1);
  });
});

describe("falling back to the status bar", () => {
  it("uses the status bar when the panel cannot be created", () => {
    const { statusBar, log, controller } = setup({
      createPanel: () => {
        throw new Error("webviews unavailable");
      },
    });
    controller.show(offer());
    expect(statusBar.show).toHaveBeenCalledWith(offer());
    expect(controller.activeSurface()).toBe("statusBar");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("using the status bar"));
  });

  it("uses the status bar, and disposes the broken panel, when the panel cannot render the offer", () => {
    const fake = fakePanel({ showThrows: true });
    const { statusBar, controller } = setup({ createPanel: () => fake.panel });
    controller.show(offer());
    expect(statusBar.show).toHaveBeenCalledWith(offer());
    expect(fake.panel.dispose).toHaveBeenCalled();
    expect(controller.activeSurface()).toBe("statusBar");
  });

  it("moves a still-live offer to the status bar when the developer closes the panel (not a skip)", () => {
    const { statusBar, fake, controller } = setup();
    controller.show(offer());
    fake.closeByUser();
    expect(statusBar.show).toHaveBeenCalledWith(offer());
    expect(controller.activeSurface()).toBe("statusBar");
  });

  it("does nothing when the developer closes a panel that no longer has an offer", () => {
    const fake = fakePanel({ staysOpenOnHide: true });
    let events: OfferPanelEvents | null = null;
    const { statusBar, controller } = setup({
      createPanel: (e) => {
        events = e;
        return fake.panel;
      },
    });
    controller.show(offer());
    controller.hide();
    events!.onClosedByUser();
    expect(statusBar.show).not.toHaveBeenCalled();
  });

  it("never lets a broken video setting break presentation", () => {
    const statusBar = { show: vi.fn(), hide: vi.fn() };
    const fake = fakePanel();
    const controller = new OfferPresentationController({
      statusBar,
      createPanel: () => fake.panel,
      preference: () => "panel",
      videoAllowed: () => {
        throw new Error("config read failed");
      },
    });
    controller.show(offer());
    expect(fake.panel.show).toHaveBeenCalledWith(offer(), { videoAllowed: false });
  });
});

describe("statusBar (compact) mode behaves exactly like the status bar alone", () => {
  it("never creates a panel and shows every offer on the status bar", () => {
    const { statusBar, createPanel, controller } = setup({ preference: "statusBar" });
    controller.show(offer());
    controller.hide();
    expect(createPanel).not.toHaveBeenCalled();
    expect(statusBar.show).toHaveBeenCalledWith(offer());
    expect(statusBar.hide).toHaveBeenCalled();
  });

  it("closes a panel left over from before the setting changed", () => {
    const fake = fakePanel({ staysOpenOnHide: true });
    const { statusBar, pref, controller } = setup({ createPanel: () => fake.panel });
    controller.show(offer());
    controller.hide();
    pref.value = "statusBar";
    controller.show(offer({ displayEventId: "disp_2" }));
    expect(fake.panel.dispose).toHaveBeenCalled();
    expect(statusBar.show).toHaveBeenCalledWith(offer({ displayEventId: "disp_2" }));
  });

  it("drives the same SponsoredOfferController calls as the bare status bar view", async () => {
    async function run(view: { show: (o: SponsoredOpportunity) => void; hide: () => void }) {
      const requestSponsoredOpportunity = vi.fn().mockResolvedValue(offer());
      const reportOfferEvent = vi.fn().mockResolvedValue({ ok: true, eventId: "e" });
      const client = {
        startSession: vi.fn(),
        endSession: vi.fn(),
        requestSponsoredOpportunity,
        reportOfferEvent,
        completeQualifyingAction: vi.fn(),
        getWallet: vi.fn(),
      } as unknown as SponsorshipApi;
      const controller = new SponsoredOfferController({
        getClient: () => client,
        session: { currentSessionId: () => "sess_1", start: async () => "sess_1", invalidate: () => {} },
        view,
        openExternal: vi.fn().mockResolvedValue(true),
      });
      const tracker = { elapsedSeconds: () => 30, isStillRunning: () => true };
      // statusBar mode supplies no availableSeconds, exactly like main before panels existed.
      await controller.maybeRequest(tracker, { enabled: true, minimumWaitSeconds: 8, isSignedIn: true, standardAdShowing: false });
      await controller.skip();
      return { requests: requestSponsoredOpportunity.mock.calls, events: reportOfferEvent.mock.calls };
    }
    const bare = { show: vi.fn(), hide: vi.fn() };
    const viaBare = await run(bare);
    const { statusBar, controller } = setup({ preference: "statusBar" });
    const viaController = await run(controller);
    expect(viaController).toEqual(viaBare);
    expect(viaController.requests).toEqual([[{ sessionId: "sess_1", interactionKind: "WAIT" }]]);
    expect(statusBar.show.mock.calls).toEqual(bare.show.mock.calls);
    expect(statusBar.hide.mock.calls).toEqual(bare.hide.mock.calls);
  });
});
