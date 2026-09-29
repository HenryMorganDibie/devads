import { describe, expect, it, vi } from "vitest";
import { DevAdsError } from "@devads/ad-sdk";
import { SponsorshipSession } from "../sponsorshipSession";
import type { SponsorshipApi } from "../sponsorshipClient";

function session(id = "sess_1") {
  return {
    id,
    clientType: "VS_CODE" as const,
    clientVersion: "0.1.0",
    activityCategory: null,
    status: "ACTIVE" as const,
    startedAt: "2026-09-29T00:00:00.000Z",
    endedAt: null,
  };
}

/** A mocked DevAdsClient: every protocol method is a vi.fn(). */
function mockClient(overrides: Partial<Record<keyof SponsorshipApi, ReturnType<typeof vi.fn>>> = {}) {
  return {
    startSession: vi.fn().mockResolvedValue(session()),
    endSession: vi.fn().mockResolvedValue({ ...session(), status: "ENDED", endedAt: "2026-09-29T01:00:00.000Z" }),
    requestSponsoredOpportunity: vi.fn().mockResolvedValue(null),
    reportOfferEvent: vi.fn(),
    completeQualifyingAction: vi.fn(),
    getWallet: vi.fn(),
    ...overrides,
  } as unknown as SponsorshipApi & Record<keyof SponsorshipApi, ReturnType<typeof vi.fn>>;
}

describe("SponsorshipSession", () => {
  it("start() calls the SDK's startSession with no extra context and caches the id", async () => {
    const client = mockClient();
    const s = new SponsorshipSession(() => client);
    expect(await s.start()).toBe("sess_1");
    expect(client.startSession).toHaveBeenCalledWith();
    expect(s.currentSessionId()).toBe("sess_1");

    // Already started: no second request.
    expect(await s.start()).toBe("sess_1");
    expect(client.startSession).toHaveBeenCalledTimes(1);
  });

  it("concurrent start() calls share one in-flight request", async () => {
    const client = mockClient();
    const s = new SponsorshipSession(() => client);
    const [a, b] = await Promise.all([s.start(), s.start()]);
    expect(a).toBe("sess_1");
    expect(b).toBe("sess_1");
    expect(client.startSession).toHaveBeenCalledTimes(1);
  });

  it("end() calls endSession with the cached id and clears it", async () => {
    const client = mockClient();
    const s = new SponsorshipSession(() => client);
    await s.start();
    await s.end();
    expect(client.endSession).toHaveBeenCalledWith("sess_1");
    expect(s.currentSessionId()).toBeNull();
  });

  it("end() without a session makes no request", async () => {
    const client = mockClient();
    await new SponsorshipSession(() => client).end();
    expect(client.endSession).not.toHaveBeenCalled();
  });

  it("end() waits for an in-flight start so the new session is not orphaned", async () => {
    let resolveStart!: (v: ReturnType<typeof session>) => void;
    const client = mockClient({
      startSession: vi.fn(() => new Promise((r) => (resolveStart = r))),
    });
    const s = new SponsorshipSession(() => client);
    void s.start();
    const ending = s.end();
    resolveStart(session("sess_late"));
    await ending;
    expect(client.endSession).toHaveBeenCalledWith("sess_late");
  });

  it.each([
    ["network", new DevAdsError("network", "down")],
    ["timeout", new DevAdsError("timeout", "slow")],
    ["rejected", new DevAdsError("rejected", "nope", { status: 404, reason: "developer_not_found" })],
    ["non-SDK error", new Error("boom")],
  ])("start() tolerates a %s failure: resolves null, logs, never throws", async (_label, err) => {
    const log = vi.fn();
    const client = mockClient({ startSession: vi.fn().mockRejectedValue(err) });
    const s = new SponsorshipSession(() => client, log);
    await expect(s.start()).resolves.toBeNull();
    expect(s.currentSessionId()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("session start failed"));
  });

  it("start() retries on the next call after a failure", async () => {
    const client = mockClient({
      startSession: vi.fn().mockRejectedValueOnce(new DevAdsError("network", "down")).mockResolvedValue(session()),
    });
    const s = new SponsorshipSession(() => client);
    expect(await s.start()).toBeNull();
    expect(await s.start()).toBe("sess_1");
  });

  it("end() tolerates SDK failures and still clears the id", async () => {
    const log = vi.fn();
    const client = mockClient({ endSession: vi.fn().mockRejectedValue(new DevAdsError("timeout", "slow")) });
    const s = new SponsorshipSession(() => client, log);
    await s.start();
    await expect(s.end()).resolves.toBeUndefined();
    expect(s.currentSessionId()).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("session end failed: timeout"));
  });

  it("is a no-op when no client can be built", async () => {
    const s = new SponsorshipSession(() => null);
    await expect(s.start()).resolves.toBeNull();
    await expect(s.end()).resolves.toBeUndefined();
  });

  it("invalidate() drops the cached id without a request", async () => {
    const client = mockClient();
    const s = new SponsorshipSession(() => client);
    await s.start();
    s.invalidate();
    expect(s.currentSessionId()).toBeNull();
    expect(client.endSession).not.toHaveBeenCalled();
  });
});
