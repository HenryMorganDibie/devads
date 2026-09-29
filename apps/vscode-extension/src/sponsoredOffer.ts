import { isDevAdsError, type RewardType, type SponsoredOpportunity } from "@devads/ad-sdk";
import { isEligibleForAdRequest } from "./eligibility";
import { describeSponsorshipError, isStaleSessionError, type SponsorshipApi } from "./sponsorshipClient";

/**
 * Sponsored-offer surface: the NEW sponsorship path, kept fully separate
 * from the standard ad path (AdClient / StatusBarAd). Pure: no VS Code API,
 * everything platform-specific is injected, so it is unit-testable and the
 * extension wires it to a status bar item.
 *
 * Trigger: the same terminal-wait signal the standard ad flow uses (a
 * CommandTracker for a command still running past the minimum wait). It
 * reads the tracker but never mutates it, so the standard flow's own
 * once-per-command bookkeeping is untouched.
 *
 * What is sent to the SDK: the session id and the offer's server-issued
 * displayEventId, nothing else. No command line, language, file path,
 * workspace info, source code or prompt content is ever passed.
 *
 * Qualifying action: the only thing this extension can honestly observe is
 * the developer explicitly opening the sponsor's link. It claims completion
 * for that and nothing else (see canClaimCompletionOnOpen).
 */

/** The bits of CommandTracker this module reads. */
export interface WaitSignal {
  elapsedSeconds(): number;
  isStillRunning(): boolean;
}

export interface SponsoredOfferView {
  show(offer: SponsoredOpportunity): void;
  hide(): void;
}

export interface SessionLike {
  currentSessionId(): string | null;
  start(): Promise<string | null>;
  invalidate(): void;
}

export interface SponsoredOfferDeps {
  getClient: () => SponsorshipApi | null;
  session: SessionLike;
  view: SponsoredOfferView;
  /** Opens the URL externally; resolves true only if it was actually opened. */
  openExternal: (url: string) => Promise<boolean>;
  /** User-facing, non-modal notice (reward earned). */
  notify?: (message: string) => void;
  log?: (message: string) => void;
}

export interface OfferTickInput {
  /** devads.enabled AND devads.sponsorship.enabled. */
  enabled: boolean;
  minimumWaitSeconds: number;
  isSignedIn: boolean;
  /** True if the standard ad status bar item is currently showing an ad. */
  standardAdShowing: boolean;
}

const REWARD_LABELS: Record<RewardType, string> = {
  AI_CREDITS: "AI credits",
  API_CREDITS: "API credits",
  COMPUTE_CREDITS: "compute credits",
  TOOL_CREDITS: "tool credits",
  CASH: "cash",
  DISCOUNT: "discount",
  SUBSCRIPTION_CREDIT: "subscription credit",
  OTHER: "other reward",
};

export function rewardLabel(type: RewardType): string {
  return REWARD_LABELS[type] ?? "reward";
}

/** e.g. "50 units (AI credits)". Units are the server's opaque integer reward units. */
export function formatReward(type: RewardType, units: number): string {
  return `${units} ${units === 1 ? "unit" : "units"} (${rewardLabel(type)})`;
}

/**
 * Whether opening the sponsor link is, by itself, the offer's qualifying
 * action. When the sponsor stated a further required action (free text such
 * as "create a project"), the extension cannot observe it without invasive
 * tracking, so it reports OFFER_OPENED only and does not claim completion.
 */
export function canClaimCompletionOnOpen(offer: SponsoredOpportunity): boolean {
  return !offer.requiredAction || offer.requiredAction.trim().length === 0;
}

interface DisplayedOffer {
  offer: SponsoredOpportunity;
  /** Session the offer was requested under, threaded into every later event. */
  sessionId: string | undefined;
}

export class SponsoredOfferController {
  private current: DisplayedOffer | null = null;
  /** The most recent displayed offer, kept after hiding so a still-open notification can act on it. */
  private lastShown: DisplayedOffer | null = null;
  /** Trackers whose current command run has already been considered for an offer. */
  private requested = new WeakSet<object>();
  /** Display ids already completed from this client, so a second click doesn't resend. */
  private completed = new Set<string>();

  constructor(private readonly deps: SponsoredOfferDeps) {}

  getCurrent(): SponsoredOpportunity | null {
    return this.current?.offer ?? null;
  }

  /** Call when a new command starts in the tracker's terminal: that run may be considered once. */
  onCommandStart(tracker: object): void {
    this.requested.delete(tracker);
  }

  /** The wait is over: the offer goes away with it (never shown longer than the wait). */
  onCommandEnd(): void {
    this.clear();
  }

  /**
   * Considers one tracker for a sponsored offer. At most one request per
   * command run. Never throws.
   */
  async maybeRequest(tracker: WaitSignal & object, input: OfferTickInput): Promise<void> {
    try {
      const eligible = isEligibleForAdRequest(
        { enabled: input.enabled, minimumWaitSeconds: input.minimumWaitSeconds },
        {
          isSignedIn: input.isSignedIn,
          elapsedSeconds: tracker.elapsedSeconds(),
          alreadyRequestedForThisCommand: this.requested.has(tracker),
          stillRunning: tracker.isStillRunning(),
        }
      );
      if (!eligible) return;
      this.requested.add(tracker);

      // One promotional surface per wait: if a standard ad is already on
      // screen for this wait, don't stack a sponsored offer next to it.
      if (input.standardAdShowing || this.current) return;

      const client = this.deps.getClient();
      if (!client) return;

      const sessionId = this.deps.session.currentSessionId() ?? (await this.deps.session.start()) ?? undefined;

      let offer: SponsoredOpportunity | null;
      try {
        offer = await client.requestSponsoredOpportunity(sessionId ? { sessionId } : {});
      } catch (err) {
        if (isStaleSessionError(err)) this.deps.session.invalidate();
        this.log(`sponsored offer request failed: ${describeSponsorshipError(err)}`);
        return;
      }

      // Same rule as the standard flow: never show anything after the wait is over.
      if (!offer || !tracker.isStillRunning()) return;

      this.current = { offer, sessionId };
      this.lastShown = this.current;
      this.deps.view.show(offer);
    } catch (err) {
      this.log(`sponsored offer tick failed: ${describeSponsorshipError(err)}`);
    }
  }

  /** Developer clicked the sponsored status bar item to see its details. */
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
   * OFFER_OPENED only if the link actually opened, then, if opening is the
   * offer's whole qualifying action, reports completion against the same
   * displayEventId. The server decides whether a reward is granted.
   *
   * Accepts the offer explicitly so a notification opened before the
   * command ended can still act on the offer it was showing.
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
      opened = await this.deps.openExternal(offer.ctaUrl);
    } catch {
      opened = false;
    }
    if (!opened) return;

    await this.report("OFFER_OPENED", shown);

    if (!canClaimCompletionOnOpen(offer) || this.completed.has(offer.displayEventId)) return;
    this.completed.add(offer.displayEventId);
    try {
      const client = this.deps.getClient();
      if (!client) {
        this.completed.delete(offer.displayEventId);
        return;
      }
      const result = await client.completeQualifyingAction({
        displayEventId: offer.displayEventId,
        sessionId: shown.sessionId,
      });
      if (result.rewarded && result.reward) {
        this.deps.notify?.(
          `DevAds: you earned ${formatReward(result.reward.rewardType, result.reward.amountUnits)} from "${offer.title}".`
        );
      }
    } catch (err) {
      // Transient failures may be retried by opening again; a server
      // refusal (caps, campaign ended, ...) is final for this display.
      if (!isDevAdsError(err) || err.code === "network" || err.code === "timeout") {
        this.completed.delete(offer.displayEventId);
      }
      this.log(`sponsored offer completion not recorded: ${describeSponsorshipError(err)}`);
    }
  }

  private clear(): void {
    this.current = null;
    this.deps.view.hide();
  }

  private async report(type: "OFFER_SKIPPED" | "OFFER_OPENED" | "OFFER_INTERACTED", shown: DisplayedOffer) {
    try {
      const client = this.deps.getClient();
      if (!client) return;
      await client.reportOfferEvent({
        type,
        displayEventId: shown.offer.displayEventId,
        sessionId: shown.sessionId,
      });
    } catch (err) {
      this.log(`sponsored offer ${type} not recorded: ${describeSponsorshipError(err)}`);
    }
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}
