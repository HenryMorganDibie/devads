import { describeError } from "./errors.js";
import type { ProtocolClientProvider, SessionProvider } from "./types.js";

/**
 * Owns one client's DevAds development session. Client type and version come
 * from the DevAdsClient's defaults; no activity category or other context is
 * sent.
 *
 * Every method is failure-tolerant and never throws. If the server is down,
 * the developer is not signed in, or the SDK rejects, the session is simply
 * absent and offer requests fall back to the client type alone.
 */
export class DevelopmentSessionManager implements SessionProvider {
  private sessionId: string | null = null;
  private starting: Promise<string | null> | null = null;

  constructor(
    private readonly getClient: ProtocolClientProvider,
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
        const session = await client.startSession();
        this.sessionId = session.id;
        return session.id;
      } catch (err) {
        this.log(`sponsorship session start failed: ${describeError(err)}`);
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
      this.log(`sponsorship session end failed: ${describeError(err)}`);
    }
  }

  /** Forget the cached id without calling the server (it told us the session is ended or not ours). */
  invalidate(): void {
    this.sessionId = null;
  }
}
