import { describeSponsorshipError, type SponsorshipApi } from "./sponsorshipClient";

/**
 * Owns this extension's DevAds development session (Phase 1
 * DevelopmentSession, via the SDK's startSession/endSession). Pure: no VS
 * Code API, the client is injected.
 *
 * Every method is failure-tolerant and never throws. If the ad server is
 * down, the developer isn't signed in, or the SDK rejects, the session is
 * simply absent: offer requests fall back to sending the client type alone,
 * and the standard ad flow never depends on any of this.
 */
export class SponsorshipSession {
  private sessionId: string | null = null;
  private starting: Promise<string | null> | null = null;

  constructor(
    private readonly getClient: () => SponsorshipApi | null,
    private readonly log: (message: string) => void = () => {}
  ) {}

  currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Starts a session if there isn't one. Concurrent callers share one
   * in-flight request. Resolves to the session id, or null if unavailable.
   */
  start(): Promise<string | null> {
    if (this.sessionId) return Promise.resolve(this.sessionId);
    if (this.starting) return this.starting;

    this.starting = (async () => {
      try {
        const client = this.getClient();
        if (!client) return null;
        // clientType / clientVersion come from the client's defaults (VS_CODE
        // + this extension's version). No activity category or any other
        // context is sent.
        const session = await client.startSession();
        this.sessionId = session.id;
        return session.id;
      } catch (err) {
        this.log(`sponsorship session start failed: ${describeSponsorshipError(err)}`);
        return null;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /** Ends the current session (if any). Waits for an in-flight start first so it isn't orphaned. */
  async end(): Promise<void> {
    if (this.starting) await this.starting;
    const id = this.sessionId;
    this.sessionId = null;
    if (!id) return;
    try {
      const client = this.getClient();
      if (!client) return;
      await client.endSession(id);
    } catch (err) {
      this.log(`sponsorship session end failed: ${describeSponsorshipError(err)}`);
    }
  }

  /** Forget the cached id without calling the server (it told us the session is ended/not ours). */
  invalidate(): void {
    this.sessionId = null;
  }
}
