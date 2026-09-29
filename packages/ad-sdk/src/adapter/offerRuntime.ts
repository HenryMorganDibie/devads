import type { SponsoredOpportunity } from "../types.js";
import { describeError, isRetryableCompletionError, isStaleSessionError } from "./errors.js";
import { canClaimCompletionOnOpen, formatReward } from "./rewards.js";
import type { AdapterHost, ProtocolClient, ProtocolClientProvider, SessionProvider, WaitHandle } from "./types.js";

export interface SponsoredOfferRuntimeDeps {
  getClient: ProtocolClientProvider;
  session: SessionProvider;
  host: AdapterHost;
}

interface DisplayedOffer {
  offer: SponsoredOpportunity;
  /** Session the offer was requested under, threaded into every later event. */
  sessionId: string | undefined;
}

/**
 * The host-agnostic sponsored-offer lifecycle every DevAds client shares:
 * request an offer during a natural wait, present it only while that wait
 * is still active, report skip / interact / open against the server-issued
 * displayEventId, and claim completion only when opening the link is the
 * whole qualifying action. It never throws; any failure degrades to "no
 * offer" and a log line.
 *
 * What is sent: the session id and the displayEventId, nothing else. The
 * runtime never sees, and has no way to send, source code, prompts, model
 * output, file paths, commands or secrets. It makes no economic decision:
 * the server selects offers, enforces caps and budgets, and decides whether
 * a completion is rewarded.
 *
 * Deciding *when* a wait is worth an offer (minimum duration, once per
 * wait, one promotional surface at a time with other UI) is the host's
 * policy and happens before offerDuringWait() is called.
 */
export class SponsoredOfferRuntime {
  private current: DisplayedOffer | null = null;
  /** The most recent displayed offer, kept after dismissal so a still-open detail view can act on it. */
  private lastShown: DisplayedOffer | null = null;
  /** Display ids already completed from this client, so a repeated open doesn't resend. */
  private completed = new Set<string>();

  constructor(private readonly deps: SponsoredOfferRuntimeDeps) {}

  getCurrent(): SponsoredOpportunity | null {
    return this.current?.offer ?? null;
  }

  /**
   * Requests an offer for this wait and presents it if the wait is still
   * active when the response arrives. Does nothing while an offer is already
   * showing (one sponsored offer at a time). Never throws.
   */
  async offerDuringWait(wait: WaitHandle): Promise<void> {
    try {
      if (this.current) return;
      const client = this.client();
      if (!client) return;

      const sessionId = this.deps.session.currentSessionId() ?? (await this.deps.session.start()) ?? undefined;

      let offer: SponsoredOpportunity | null;
      try {
        offer = await client.requestSponsoredOpportunity(sessionId ? { sessionId } : {});
      } catch (err) {
        if (isStaleSessionError(err)) this.deps.session.invalidate();
        this.log(`sponsored offer request failed: ${describeError(err)}`);
        return;
      }

      // Never show anything after the wait is over.
      if (!offer || !wait.isActive()) return;

      this.current = { offer, sessionId };
      this.lastShown = this.current;
      this.deps.host.presentOffer(offer);
    } catch (err) {
      this.log(`sponsored offer tick failed: ${describeError(err)}`);
    }
  }

  /** The wait is over: the offer goes away with it, without reporting a skip. */
  waitEnded(): void {
    this.clear();
  }

  /** Developer opened the offer's details. */
  async interact(): Promise<void> {
    const shown = this.current;
    if (!shown) return;
    await this.report("OFFER_INTERACTED", shown);
  }

  /** Developer explicitly skipped the offer. */
  async skip(): Promise<void> {
    const shown = this.current;
    if (!shown) return;
    this.clear();
    await this.report("OFFER_SKIPPED", shown);
  }

  /**
   * Developer explicitly chose to open the sponsor's link. Reports
   * OFFER_OPENED only if the host confirms the link opened, then, if opening
   * is the offer's whole qualifying action, reports completion against the
   * same displayEventId. The server decides whether a reward is granted.
   *
   * Accepts the offer explicitly so a detail view opened before the wait
   * ended can still act on the offer it was showing.
   */
  async open(offer: SponsoredOpportunity | null = this.getCurrent()): Promise<void> {
    if (!offer) return;
    // Thread the session the offer was displayed under. If it's unknown the
    // id is omitted and the server falls back to the display's own session.
    const shown: DisplayedOffer =
      this.lastShown && this.lastShown.offer.displayEventId === offer.displayEventId
        ? this.lastShown
        : { offer, sessionId: undefined };
    if (this.current?.offer.displayEventId === offer.displayEventId) this.clear();

    let opened = false;
    try {
      opened = await this.deps.host.openExternal(offer.ctaUrl);
    } catch {
      opened = false;
    }
    if (!opened) return;

    await this.report("OFFER_OPENED", shown);

    if (!canClaimCompletionOnOpen(offer) || this.completed.has(offer.displayEventId)) return;
    this.completed.add(offer.displayEventId);
    try {
      const client = this.client();
      if (!client) {
        this.completed.delete(offer.displayEventId);
        return;
      }
      const result = await client.completeQualifyingAction({
        displayEventId: offer.displayEventId,
        sessionId: shown.sessionId,
      });
      if (result.rewarded && result.reward) {
        this.deps.host.notify?.(
          `DevAds: you earned ${formatReward(result.reward.rewardType, result.reward.amountUnits)} from "${offer.title}".`
        );
      }
    } catch (err) {
      if (isRetryableCompletionError(err)) this.completed.delete(offer.displayEventId);
      this.log(`sponsored offer completion not recorded: ${describeError(err)}`);
    }
  }

  private client(): ProtocolClient | null {
    try {
      return this.deps.getClient();
    } catch {
      return null;
    }
  }

  private clear(): void {
    this.current = null;
    try {
      this.deps.host.dismissOffer();
    } catch (err) {
      this.log(`sponsored offer dismiss failed: ${describeError(err)}`);
    }
  }

  private async report(type: "OFFER_SKIPPED" | "OFFER_OPENED" | "OFFER_INTERACTED", shown: DisplayedOffer) {
    try {
      const client = this.client();
      if (!client) return;
      await client.reportOfferEvent({
        type,
        displayEventId: shown.offer.displayEventId,
        sessionId: shown.sessionId,
      });
    } catch (err) {
      this.log(`sponsored offer ${type} not recorded: ${describeError(err)}`);
    }
  }

  private log(message: string): void {
    try {
      this.deps.host.log?.(message);
    } catch {
      // A broken logger must not break the developer's tool.
    }
  }
}
