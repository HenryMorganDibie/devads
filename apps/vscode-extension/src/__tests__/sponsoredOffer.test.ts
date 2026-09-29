import { describe, expect, it, vi } from "vitest";
import { DevAdsError, type SponsoredOpportunity } from "@devads/ad-sdk";
import {
  canClaimCompletionOnOpen,
  formatReward,
  SponsoredOfferController,
  type OfferTickInput,
} from "../sponsoredOffer";
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

function mockClient(overrides: Partial<Record<keyof SponsorshipApi, ReturnType<typeof vi.fn>>> = {}) {
  return {
    startSession: vi.fn(),
    endSession: vi.fn(),
    requestSponsoredOpportunity: vi.fn().mockResolvedValue(offer()),
    reportOfferEvent: vi.fn().mockResolvedValue({ ok: true, eventId: "e" }),
    completeQualifyingAction: vi.fn().mockResolvedValue({
      ok: true,
      rewarded: true,
      reward: { rewardType: "AI_CREDITS", amountUnits: 50, status: "APPROVED" },
      eventId: "e",
    }),
    getWallet: vi.fn(),
    ...overrides,
  } as unknown as SponsorshipApi & Record<keyof SponsorshipApi, ReturnType<typeof vi.fn>>;
}

function setup(opts: { client?: ReturnType<typeof mockClient>; sessionId?: string | null; opened?: boolean } = {}) {
  const client = opts.client ?? mockClient();
  const sessionId = opts.sessionId === undefined ? "sess_1" : opts.sessionId;
  const session = {
    currentSessionId: vi.fn(() => sessionId),
    start: vi.fn().mockResolvedValue(sessionId),
    invalidate: vi.fn(),
  };
  const view = { show: vi.fn(), hide: vi.fn() };
  const openExternal = vi.fn().mockResolvedValue(opts.opened ?? true);
  const notify = vi.fn();
  const log = vi.fn();
  const controller = new SponsoredOfferController({
    getClient: () => client,
    session,
    view,
    openExternal,
    notify,
    log,
  });
  return { client, session, view, openExternal, notify, log, controller };
}

function tracker(elapsed = 30, running = true) {
  const state = { elapsed, running };
  return {
    state,
    elapsedSeconds: () => state.elapsed,
    isStillRunning: () => state.running,
  };
}

const TICK: OfferTickInput = { enabled: true, minimumWaitSeconds: 8, isSignedIn: true, standardAdShowing: false };

describe("SponsoredOfferController: requesting and showing", () => {
  it("requests an offer with the session id and shows it once the wait threshold has passed", async () => {
    const { client, view, controller } = setup();
    await controller.maybeRequest(tracker(), TICK);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1" });
    expect(view.show).toHaveBeenCalledWith(offer());
    expect(controller.getCurrent()?.displayEventId).toBe("disp_1");
  });

  it("starts a session lazily when none is cached", async () => {
    const { session, client, controller } = setup();
    session.currentSessionId.mockReturnValueOnce(null);
    await controller.maybeRequest(tracker(), TICK);
    expect(session.start).toHaveBeenCalled();
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1" });
  });

  it("falls back to the client type alone (SDK default VS_CODE) when no session is available", async () => {
    const { client, controller } = setup({ sessionId: null });
    await controller.maybeRequest(tracker(), TICK);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({});
  });

  it.each<[string, Partial<OfferTickInput>, ReturnType<typeof tracker>]>([
    ["disabled", { enabled: false }, tracker()],
    ["signed out", { isSignedIn: false }, tracker()],
    ["under the minimum wait", {}, tracker(3)],
    ["command already ended", {}, tracker(30, false)],
  ])("does not request when %s", async (_label, patch, t) => {
    const { client, controller } = setup();
    await controller.maybeRequest(t, { ...TICK, ...patch });
    expect(client.requestSponsoredOpportunity).not.toHaveBeenCalled();
  });

  it("requests at most once per command run, and again after the next command starts", async () => {
    const { client, controller } = setup({ client: mockClient({ requestSponsoredOpportunity: vi.fn().mockResolvedValue(null) }) });
    const t = tracker();
    await controller.maybeRequest(t, TICK);
    await controller.maybeRequest(t, TICK);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledTimes(1);
    controller.onCommandStart(t);
    await controller.maybeRequest(t, TICK);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledTimes(2);
  });

  it("does not stack a sponsored offer on top of a standard ad already showing for this wait", async () => {
    const { client, controller } = setup();
    const t = tracker();
    await controller.maybeRequest(t, { ...TICK, standardAdShowing: true });
    // ...and does not pop one up later in the same wait either.
    await controller.maybeRequest(t, TICK);
    expect(client.requestSponsoredOpportunity).not.toHaveBeenCalled();
  });

  it("does not show an offer that arrives after the command ended", async () => {
    const t = tracker();
    const client = mockClient({
      requestSponsoredOpportunity: vi.fn(async () => {
        t.state.running = false;
        return offer();
      }),
    });
    const { view, controller } = setup({ client });
    await controller.maybeRequest(t, TICK);
    expect(view.show).not.toHaveBeenCalled();
    expect(controller.getCurrent()).toBeNull();
  });

  it("shows nothing when the server has no offer", async () => {
    const { view, controller } = setup({ client: mockClient({ requestSponsoredOpportunity: vi.fn().mockResolvedValue(null) }) });
    await controller.maybeRequest(tracker(), TICK);
    expect(view.show).not.toHaveBeenCalled();
  });

  it.each([
    new DevAdsError("network", "down"),
    new DevAdsError("timeout", "slow"),
    new DevAdsError("invalid_response", "bad body"),
    new Error("unexpected"),
  ])("tolerates request failure (%s): nothing shown, nothing thrown", async (err) => {
    const { view, controller, log } = setup({
      client: mockClient({ requestSponsoredOpportunity: vi.fn().mockRejectedValue(err) }),
    });
    await expect(controller.maybeRequest(tracker(), TICK)).resolves.toBeUndefined();
    expect(view.show).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it("drops a stale session when the server says it has ended", async () => {
    const { session, controller } = setup({
      client: mockClient({
        requestSponsoredOpportunity: vi
          .fn()
          .mockRejectedValue(new DevAdsError("rejected", "x", { status: 409, reason: "session_ended" })),
      }),
    });
    await controller.maybeRequest(tracker(), TICK);
    expect(session.invalidate).toHaveBeenCalled();
  });

  it("never throws even if building the client or the session throws", async () => {
    const session = {
      currentSessionId: () => {
        throw new Error("boom");
      },
      start: vi.fn(),
      invalidate: vi.fn(),
    };
    const controller = new SponsoredOfferController({
      getClient: () => mockClient(),
      session,
      view: { show: vi.fn(), hide: vi.fn() },
      openExternal: vi.fn(),
    });
    await expect(controller.maybeRequest(tracker(), TICK)).resolves.toBeUndefined();

    const throwingFactory = new SponsoredOfferController({
      getClient: () => {
        throw new Error("no client");
      },
      session: { currentSessionId: () => null, start: vi.fn(), invalidate: vi.fn() },
      view: { show: vi.fn(), hide: vi.fn() },
      openExternal: vi.fn(),
    });
    await expect(throwingFactory.maybeRequest(tracker(), TICK)).resolves.toBeUndefined();
  });

  it("hides the offer when the command ends, without reporting a skip", async () => {
    const { client, view, controller } = setup();
    await controller.maybeRequest(tracker(), TICK);
    controller.onCommandEnd();
    expect(view.hide).toHaveBeenCalled();
    expect(controller.getCurrent()).toBeNull();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
  });
});

describe("SponsoredOfferController: skip / interact / open wiring", () => {
  async function shown(opts: Parameters<typeof setup>[0] = {}) {
    const ctx = setup(opts);
    await ctx.controller.maybeRequest(tracker(), TICK);
    return ctx;
  }

  it("skip reports OFFER_SKIPPED against the displayEventId and session, then hides", async () => {
    const { client, view, controller } = await shown();
    await controller.skip();
    expect(client.reportOfferEvent).toHaveBeenCalledWith({
      type: "OFFER_SKIPPED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(view.hide).toHaveBeenCalled();
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("interact reports OFFER_INTERACTED and keeps the offer visible", async () => {
    const { client, controller } = await shown();
    await controller.interact();
    expect(client.reportOfferEvent).toHaveBeenCalledWith({
      type: "OFFER_INTERACTED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(controller.getCurrent()).not.toBeNull();
  });

  it("open reports OFFER_OPENED then completeQualifyingAction with the same displayEventId", async () => {
    const { client, openExternal, notify, controller } = await shown();
    await controller.open();
    expect(openExternal).toHaveBeenCalledWith("https://acme.example/devads");
    expect(client.reportOfferEvent).toHaveBeenCalledWith({
      type: "OFFER_OPENED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(client.completeQualifyingAction).toHaveBeenCalledWith({ displayEventId: "disp_1", sessionId: "sess_1" });
    expect(client.reportOfferEvent.mock.invocationCallOrder[0]).toBeLessThan(
      client.completeQualifyingAction.mock.invocationCallOrder[0]
    );
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("50 units (AI credits)"));
    expect(controller.getCurrent()).toBeNull();
  });

  it("threads the session the offer was displayed under, even if the session changes later", async () => {
    const ctx = await shown();
    ctx.session.currentSessionId.mockReturnValue("sess_2");
    await ctx.controller.open();
    expect(ctx.client.completeQualifyingAction).toHaveBeenCalledWith({ displayEventId: "disp_1", sessionId: "sess_1" });
  });

  it("an offer opened from a notification after the command ended still threads its display ids", async () => {
    const ctx = await shown();
    const o = ctx.controller.getCurrent()!;
    ctx.controller.onCommandEnd();
    await ctx.controller.open(o);
    expect(ctx.client.completeQualifyingAction).toHaveBeenCalledWith({ displayEventId: "disp_1", sessionId: "sess_1" });
  });

  it("reports nothing if the link was not actually opened", async () => {
    const { client, controller } = await shown({ opened: false });
    await controller.open();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("does not claim completion when the offer names a further required action the extension cannot observe", async () => {
    const client = mockClient({
      requestSponsoredOpportunity: vi.fn().mockResolvedValue(offer({ requiredAction: "Create your first project" })),
    });
    const { controller } = await shown({ client });
    await controller.open();
    expect(client.reportOfferEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "OFFER_OPENED" }));
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("completes a given display at most once from this client", async () => {
    const { client, controller } = await shown();
    const o = controller.getCurrent()!;
    await controller.open(o);
    await controller.open(o);
    expect(client.completeQualifyingAction).toHaveBeenCalledTimes(1);
  });

  it("allows a retry after a transient completion failure but not after a server refusal", async () => {
    const transient = mockClient({
      completeQualifyingAction: vi.fn().mockRejectedValueOnce(new DevAdsError("network", "down")).mockResolvedValue({ ok: true, eventId: "e" }),
    });
    const a = await shown({ client: transient });
    const o = a.controller.getCurrent()!;
    await a.controller.open(o);
    await a.controller.open(o);
    expect(transient.completeQualifyingAction).toHaveBeenCalledTimes(2);

    const refused = mockClient({
      completeQualifyingAction: vi
        .fn()
        .mockRejectedValue(new DevAdsError("rejected", "cap", { status: 409, reason: "developer_daily_cap_reached" })),
    });
    const b = await shown({ client: refused });
    const o2 = b.controller.getCurrent()!;
    await expect(b.controller.open(o2)).resolves.toBeUndefined();
    await b.controller.open(o2);
    expect(refused.completeQualifyingAction).toHaveBeenCalledTimes(1);
    expect(b.notify).not.toHaveBeenCalled();
    expect(b.log).toHaveBeenCalledWith(expect.stringContaining("developer_daily_cap_reached"));
  });

  it("does not notify a reward the server did not grant", async () => {
    const client = mockClient({ completeQualifyingAction: vi.fn().mockResolvedValue({ ok: true, rewarded: false, eventId: "e" }) });
    const { notify, controller } = await shown({ client });
    await controller.open();
    expect(notify).not.toHaveBeenCalled();
  });

  it("event reporting failures never throw out of skip/interact/open", async () => {
    const client = mockClient({ reportOfferEvent: vi.fn().mockRejectedValue(new DevAdsError("timeout", "slow")) });
    const { controller } = await shown({ client });
    await expect(controller.interact()).resolves.toBeUndefined();
    await expect(controller.open(controller.getCurrent())).resolves.toBeUndefined();
    await expect(controller.skip()).resolves.toBeUndefined();
  });

  it("skip/interact/open are no-ops with no offer showing", async () => {
    const { client, openExternal, controller } = setup();
    await controller.skip();
    await controller.interact();
    await controller.open();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("offer helpers", () => {
  it("formats rewards with the reward type", () => {
    expect(formatReward("API_CREDITS", 1)).toBe("1 unit (API credits)");
    expect(formatReward("COMPUTE_CREDITS", 200)).toBe("200 units (compute credits)");
  });

  it("only treats link-open as the qualifying action when no further action is required", () => {
    expect(canClaimCompletionOnOpen(offer({ requiredAction: null }))).toBe(true);
    expect(canClaimCompletionOnOpen(offer({ requiredAction: "  " }))).toBe(true);
    expect(canClaimCompletionOnOpen(offer({ requiredAction: "Deploy an app" }))).toBe(false);
  });
});
