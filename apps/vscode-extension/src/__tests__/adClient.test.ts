import { describe, expect, it, vi } from "vitest";
import { AdClient } from "../adClient";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("AdClient", () => {
  it("returns the ad candidate on a successful select response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ ad: { impressionId: "imp_1", campaignId: "camp_1", eventId: "evt_1" } })
    );
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    const ad = await client.selectAd({ developerId: "dev_1", elapsedSeconds: 10 });
    expect(ad?.campaignId).toBe("camp_1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/ads/select",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null when the server responds with ad: null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ad: null }));
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    expect(await client.selectAd({ developerId: "dev_1", elapsedSeconds: 10 })).toBeNull();
  });

  it("degrades to null on a non-OK response rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "server_error" }, false));
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    expect(await client.selectAd({ developerId: "dev_1", elapsedSeconds: 10 })).toBeNull();
  });

  it("degrades to null on a network failure rather than throwing (offline mode)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    await expect(client.selectAd({ developerId: "dev_1", elapsedSeconds: 10 })).resolves.toBeNull();
  });

  it("reportEvent never throws even when the request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    await expect(
      client.reportEvent({ eventId: "e1", type: "DISMISS", campaignId: "c1", developerId: "d1" })
    ).resolves.toBeUndefined();
  });

  it("passes an AbortSignal to the fetch call so a slow server can actually be aborted", async () => {
    // A fetchImpl that never resolves on its own -- it only settles when
    // its request's AbortSignal fires. If the timeout wiring is cosmetic
    // (signal constructed but never attached to the real request), this
    // promise would hang forever and the test would time out.
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error("no AbortSignal was passed to fetch");
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const client = new AdClient("http://localhost:4000", "test-token", fetchImpl as unknown as typeof fetch);
    const result = await client.selectAd({ developerId: "dev_1", elapsedSeconds: 10 });
    expect(result).toBeNull();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }, 10000);
});
