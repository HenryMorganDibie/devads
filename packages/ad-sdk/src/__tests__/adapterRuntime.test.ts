import { describe, expect, it, vi } from "vitest";
import {
  DevAdsError,
  DevelopmentSessionManager,
  SponsoredOfferRuntime,
  canClaimCompletionOnOpen,
  describeError,
  formatReward,
  isRetryableCompletionError,
  isStaleSessionError,
  type AdapterHost,
  type ProtocolClient,
  type QualifyingInteraction,
  type SponsoredOpportunity,
  type WaitHandle,
} from "../index.js";

function offer(overrides: Partial<SponsoredOpportunity> = {}): SponsoredOpportunity {
  return {
    displayEventId: "disp_1",
    offerId: "offer_1",
    campaignId: "camp_1",
    title: "Try the product",
    description: "A sponsored product",
    ctaUrl: "https://sponsor.example/try",
    requiredAction: null,
    rewardType: "API_CREDITS",
    rewardAmountUnits: 25,
    expiresAt: null,
    ...overrides,
  };
}

type Mocked = { [K in keyof ProtocolClient]: ReturnType<typeof vi.fn> };

function mockClient(overrides: Partial<Mocked> = {}): ProtocolClient & Mocked {
  return {
    startSession: vi.fn().mockResolvedValue({ id: "sess_1" }),
    endSession: vi.fn().mockResolvedValue({ id: "sess_1" }),
    requestSponsoredOpportunity: vi.fn().mockResolvedValue(offer()),
    reportOfferEvent: vi.fn().mockResolvedValue({ ok: true, eventId: "e" }),
    completeQualifyingAction: vi.fn().mockResolvedValue({
      ok: true,
      rewarded: true,
      reward: { rewardType: "API_CREDITS", amountUnits: 25, status: "APPROVED" },
      eventId: "e",
    }),
    ...overrides,
  } as unknown as ProtocolClient & Mocked;
}

function mockHost(opened = true) {
  return {
    presentOffer: vi.fn(),
    dismissOffer: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(opened),
    notify: vi.fn(),
    log: vi.fn(),
  } satisfies AdapterHost;
}

function setup(opts: { client?: ProtocolClient | null; opened?: boolean } = {}) {
  const client = opts.client === undefined ? mockClient() : opts.client;
  const host = mockHost(opts.opened);
  const session = new DevelopmentSessionManager(() => client, host.log);
  const runtime = new SponsoredOfferRuntime({ getClient: () => client, session, host });
  return { client: client as ProtocolClient & Mocked, host, session, runtime };
}

const activeWait = (active = true) => ({ isActive: () => active });

describe("SponsoredOfferRuntime", () => {
  it("starts a session, requests an offer under it and presents it while the wait is active", async () => {
    const { client, host, runtime } = setup();
    await runtime.offerDuringWait(activeWait());
    expect(client.startSession).toHaveBeenCalledTimes(1);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", interactionKind: "WAIT" });
    expect(host.presentOffer).toHaveBeenCalledWith(offer());
    expect(runtime.getCurrent()?.displayEventId).toBe("disp_1");
  });

  it("does not present an offer that arrives after the wait ended", async () => {
    const { host, runtime } = setup();
    await runtime.offerDuringWait(activeWait(false));
    expect(host.presentOffer).not.toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
  });

  it("shows at most one offer at a time", async () => {
    const { client, runtime } = setup();
    await runtime.offerDuringWait(activeWait());
    await runtime.offerDuringWait(activeWait());
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledTimes(1);
  });

  it("falls back to no session id when the session cannot be started", async () => {
    const client = mockClient({ startSession: vi.fn().mockRejectedValue(new DevAdsError("network", "down")) });
    const { runtime } = setup({ client });
    await runtime.offerDuringWait(activeWait());
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ interactionKind: "WAIT" });
  });

  it("invalidates the cached session on a stale-session rejection", async () => {
    const client = mockClient({
      requestSponsoredOpportunity: vi
        .fn()
        .mockRejectedValue(new DevAdsError("rejected", "x", { status: 409, reason: "session_ended" })),
    });
    const { session, runtime, host } = setup({ client });
    await runtime.offerDuringWait(activeWait());
    expect(session.currentSessionId()).toBeNull();
    expect(host.presentOffer).not.toHaveBeenCalled();
    expect(host.log).toHaveBeenCalledWith("sponsored offer request failed: rejected (session_ended)");
  });

  it("degrades to no offer when the client is unavailable or the factory throws", async () => {
    const none = setup({ client: null });
    await none.runtime.offerDuringWait(activeWait());
    expect(none.host.presentOffer).not.toHaveBeenCalled();

    const host = mockHost();
    const runtime = new SponsoredOfferRuntime({
      getClient: () => {
        throw new Error("boom");
      },
      session: new DevelopmentSessionManager(() => null),
      host,
    });
    await expect(runtime.offerDuringWait(activeWait())).resolves.toBeUndefined();
    await expect(runtime.open(offer())).resolves.toBeUndefined();
    expect(host.presentOffer).not.toHaveBeenCalled();
  });

  it("never throws when the host itself throws", async () => {
    const client = mockClient();
    const host: AdapterHost = {
      presentOffer: () => {
        throw new Error("render failed");
      },
      dismissOffer: () => {
        throw new Error("dismiss failed");
      },
      openExternal: () => Promise.reject(new Error("no browser")),
      log: () => {
        throw new Error("logger failed");
      },
    };
    const runtime = new SponsoredOfferRuntime({ getClient: () => client, session: new DevelopmentSessionManager(() => client), host });
    await expect(runtime.offerDuringWait(activeWait())).resolves.toBeUndefined();
    await expect(runtime.skip()).resolves.toBeUndefined();
    await expect(runtime.open(offer())).resolves.toBeUndefined();
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("waitEnded dismisses without reporting a skip", async () => {
    const { client, host, runtime } = setup();
    await runtime.offerDuringWait(activeWait());
    runtime.waitEnded();
    expect(host.dismissOffer).toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
  });

  it("reports skip and interact against the displayEventId and session", async () => {
    const { client, runtime } = setup();
    await runtime.offerDuringWait(activeWait());
    await runtime.interact();
    await runtime.skip();
    expect(client.reportOfferEvent).toHaveBeenNthCalledWith(1, {
      type: "OFFER_INTERACTED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(client.reportOfferEvent).toHaveBeenNthCalledWith(2, {
      type: "OFFER_SKIPPED",
      displayEventId: "disp_1",
      sessionId: "sess_1",
    });
    expect(runtime.getCurrent()).toBeNull();
  });

  it("opening an open-only offer reports OFFER_OPENED then completion once, and notifies the reward", async () => {
    const { client, host, runtime } = setup();
    await runtime.offerDuringWait(activeWait());
    await runtime.open();
    await runtime.open(offer());
    expect(host.openExternal).toHaveBeenCalledWith("https://sponsor.example/try");
    expect(client.reportOfferEvent).toHaveBeenCalledWith({ type: "OFFER_OPENED", displayEventId: "disp_1", sessionId: "sess_1" });
    expect(client.completeQualifyingAction).toHaveBeenCalledTimes(1);
    expect(client.completeQualifyingAction).toHaveBeenCalledWith({ displayEventId: "disp_1", sessionId: "sess_1" });
    expect(host.notify).toHaveBeenCalledWith('DevAds: you earned 25 units (API credits) from "Try the product".');
  });

  it("never claims completion when the sponsor requires a further action", async () => {
    const client = mockClient({ requestSponsoredOpportunity: vi.fn().mockResolvedValue(offer({ requiredAction: "Deploy a project" })) });
    const { runtime } = setup({ client });
    await runtime.offerDuringWait(activeWait());
    await runtime.open();
    expect(client.reportOfferEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "OFFER_OPENED" }));
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("reports nothing when the host could not open the link", async () => {
    const { client, runtime } = setup({ opened: false });
    await runtime.offerDuringWait(activeWait());
    await runtime.open();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
    expect(client.completeQualifyingAction).not.toHaveBeenCalled();
  });

  it("allows a retry after a transport failure but not after a server refusal", async () => {
    const transient = mockClient({
      completeQualifyingAction: vi.fn().mockRejectedValueOnce(new DevAdsError("timeout", "slow")).mockResolvedValue({ ok: true, rewarded: false, eventId: "e" }),
    });
    const a = setup({ client: transient });
    await a.runtime.open(offer());
    await a.runtime.open(offer());
    expect(transient.completeQualifyingAction).toHaveBeenCalledTimes(2);

    const refused = mockClient({
      completeQualifyingAction: vi.fn().mockRejectedValue(new DevAdsError("rejected", "cap", { status: 409, reason: "developer_daily_cap_reached" })),
    });
    const b = setup({ client: refused });
    await b.runtime.open(offer());
    await b.runtime.open(offer());
    expect(refused.completeQualifyingAction).toHaveBeenCalledTimes(1);
  });

  it("an offer not displayed by this runtime is completed without a session id (server falls back to the display's)", async () => {
    const { client, runtime } = setup();
    await runtime.open(offer({ displayEventId: "disp_other" }));
    expect(client.completeQualifyingAction).toHaveBeenCalledWith({ displayEventId: "disp_other", sessionId: undefined });
  });
});

describe("DevelopmentSessionManager", () => {
  it("shares one in-flight start and ends the session once", async () => {
    const client = mockClient();
    const session = new DevelopmentSessionManager(() => client);
    const [a, b] = await Promise.all([session.start(), session.start()]);
    expect(a).toBe("sess_1");
    expect(b).toBe("sess_1");
    expect(client.startSession).toHaveBeenCalledTimes(1);
    await session.end();
    await session.end();
    expect(client.endSession).toHaveBeenCalledTimes(1);
    expect(session.currentSessionId()).toBeNull();
  });

  it("never throws and logs only the error code", async () => {
    const log = vi.fn();
    const client = mockClient({ startSession: vi.fn().mockRejectedValue(new DevAdsError("unauthenticated", "no token")) });
    const session = new DevelopmentSessionManager(() => client, log);
    await expect(session.start()).resolves.toBeNull();
    expect(log).toHaveBeenCalledWith("sponsorship session start failed: unauthenticated");
  });
});

describe("SponsoredOfferRuntime with qualifying interactions", () => {
  const waitInteraction = (active: () => boolean = () => true): QualifyingInteraction => ({ kind: "WAIT", isActive: active });

  /** Drives one full lifecycle and returns every client and host call in order. */
  async function trace(start: (runtime: SponsoredOfferRuntime, active: { value: boolean }) => Promise<void>) {
    const { client, host, runtime } = setup();
    const active = { value: true };
    await start(runtime, active);
    await runtime.interact();
    await runtime.open();
    active.value = false;
    runtime.interactionEnded();
    const calls = (mock: Record<string, ReturnType<typeof vi.fn>>) =>
      Object.fromEntries(Object.entries(mock).map(([name, fn]) => [name, fn.mock.calls]));
    return { client: calls(client as unknown as Record<string, ReturnType<typeof vi.fn>>), host: calls(host) };
  }

  it("a WAIT QualifyingInteraction behaves exactly like the legacy WaitHandle", async () => {
    const viaInteraction = await trace((runtime, active) => runtime.offerDuring(waitInteraction(() => active.value)));
    const viaLegacyWait = await trace((runtime, active) => runtime.offerDuringWait({ isActive: () => active.value }));
    expect(viaInteraction).toEqual(viaLegacyWait);
    expect(viaInteraction.client.requestSponsoredOpportunity).toEqual([[{ sessionId: "sess_1", interactionKind: "WAIT" }]]);
    expect(viaInteraction.client.completeQualifyingAction).toHaveLength(1);
  });

  it("a legacy WaitHandle that already says WAIT is accepted unchanged", async () => {
    const { client, runtime } = setup();
    const legacy: WaitHandle = { kind: "WAIT", isActive: () => true };
    await runtime.offerDuringWait(legacy);
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({ sessionId: "sess_1", interactionKind: "WAIT" });
  });

  it("forwards a non-wait kind to the server without changing the lifecycle", async () => {
    const { client, host, runtime } = setup();
    await runtime.offerDuring({ kind: "DEVELOPER_INITIATED", isActive: () => true });
    expect(client.requestSponsoredOpportunity).toHaveBeenCalledWith({
      sessionId: "sess_1",
      interactionKind: "DEVELOPER_INITIATED",
    });
    expect(host.presentOffer).toHaveBeenCalledWith(offer());
  });

  it("does not present after the interaction ended, and interactionEnded dismisses without a skip", async () => {
    const ended = setup();
    await ended.runtime.offerDuring(waitInteraction(() => false));
    expect(ended.host.presentOffer).not.toHaveBeenCalled();

    const { client, host, runtime } = setup();
    await runtime.offerDuring(waitInteraction());
    runtime.interactionEnded();
    expect(host.dismissOffer).toHaveBeenCalled();
    expect(runtime.getCurrent()).toBeNull();
    expect(client.reportOfferEvent).not.toHaveBeenCalled();
  });

  it("asks the interaction only for its kind, whether it is active, and its optional available seconds", async () => {
    const { runtime } = setup();
    const seen = new Set<string | symbol>();
    const interaction = new Proxy(waitInteraction(), {
      get(target, prop, receiver) {
        seen.add(prop);
        return Reflect.get(target, prop, receiver);
      },
    });
    await runtime.offerDuring(interaction);
    expect([...seen].sort()).toEqual(["availableSeconds", "isActive", "kind"]);
  });
});

describe("adapter helpers", () => {
  it("classify errors without exposing request contents", () => {
    expect(describeError(new DevAdsError("rejected", "secret message", { status: 409, reason: "campaign_ended" }))).toBe(
      "rejected (campaign_ended)"
    );
    expect(describeError(new Error("contains /home/dev/project"))).toBe("unexpected_error");
    expect(isStaleSessionError(new DevAdsError("rejected", "x", { reason: "session_not_found" }))).toBe(true);
    expect(isStaleSessionError(new DevAdsError("network", "x"))).toBe(false);
    expect(isRetryableCompletionError(new DevAdsError("network", "x"))).toBe(true);
    expect(isRetryableCompletionError(new DevAdsError("rejected", "x"))).toBe(false);
  });

  it("formats rewards and applies the open-only completion policy", () => {
    expect(formatReward("AI_CREDITS", 1)).toBe("1 unit (AI credits)");
    expect(formatReward("DISCOUNT", 3)).toBe("3 units (discount)");
    expect(canClaimCompletionOnOpen(offer({ requiredAction: "  " }))).toBe(true);
    expect(canClaimCompletionOnOpen(offer({ requiredAction: "Register for the course" }))).toBe(false);
  });
});
