export interface AdRequestContext {
  developerId: string;
  installationId?: string;
  command?: string;
  language?: string;
  framework?: string;
  runtime?: string;
  platform?: string;
  country?: string;
  elapsedSeconds: number;
}

export interface AdCandidate {
  impressionId: string;
  campaignId: string;
  creativeId: string;
  type: "IMAGE" | "VIDEO";
  headline: string;
  body: string | null;
  ctaLabel: string;
  ctaUrl: string;
  eventId: string;
}

const REQUEST_TIMEOUT_MS = 4000;

/**
 * Runs `makeRequest` with an AbortSignal that fires after `ms`, and
 * degrades to null on abort/error rather than throwing. The request must
 * be constructed INSIDE this function (not passed in as an already-started
 * promise) so the AbortController's signal can actually be attached to it
 * before the request begins -- otherwise the timeout is cosmetic and the
 * request runs to completion regardless of how long it takes.
 */
async function withTimeout<T>(makeRequest: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await makeRequest(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thin, failure-tolerant client for the ad-server. Every call is wrapped
 * so a network error, timeout, or non-2xx response degrades to "no ad" /
 * "no-op" rather than throwing -- ad delivery must never be able to
 * disrupt the developer's actual work.
 */
export class AdClient {
  constructor(
    private readonly baseUrl: string,
    private readonly sessionToken: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private authHeaders(): Record<string, string> {
    return this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {};
  }

  async selectAd(context: AdRequestContext): Promise<AdCandidate | null> {
    const result = await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/api/v1/ads/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...this.authHeaders() },
          body: JSON.stringify({ context }),
          signal,
        }),
      REQUEST_TIMEOUT_MS
    );
    if (!result || !result.ok) return null;
    try {
      const data = (await result.json()) as { ad: AdCandidate | null };
      return data.ad ?? null;
    } catch {
      return null;
    }
  }

  async reportEvent(event: {
    eventId: string;
    type: "VIEW_COMPLETE" | "CLICK" | "DISMISS";
    campaignId: string;
    impressionId?: string;
    developerId: string;
    viewDurationMs?: number;
  }): Promise<void> {
    await withTimeout(
      (signal) =>
        this.fetchImpl(`${this.baseUrl}/api/v1/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...this.authHeaders() },
          body: JSON.stringify(event),
          signal,
        }),
      REQUEST_TIMEOUT_MS
    );
  }
}
