import {
  firstPartyOfferUrl,
  SponsoredOfferRuntime,
  type QualifyingInteraction,
  type SessionProvider,
  type SponsoredOpportunity,
} from "@devads/ad-sdk";
import { isEligibleForAdRequest } from "./eligibility";
import type { SponsorshipApi } from "./sponsorshipClient";

/**
 * Sponsored-offer surface: the NEW sponsorship path, kept fully separate
 * from the standard ad path (AdClient / StatusBarAd). Pure: no VS Code API,
 * everything platform-specific is injected, so it is unit-testable and the
 * extension wires it to a status bar item.
 *
 * This is the VS Code host of the SDK's SponsoredOfferRuntime. The runtime
 * owns the offer lifecycle every DevAds client shares (request, present only
 * while the wait is active, skip / interact / open / complete against the
 * server-issued displayEventId, failure handling). This module adds only
 * what is specific to this extension:
 *
 *  - Trigger: the same terminal-wait signal the standard ad flow uses (a
 *    CommandTracker for a command still running past the minimum wait). It
 *    reads the tracker but never mutates it, so the standard flow's own
 *    once-per-command bookkeeping is untouched.
 *  - Policy: at most one request per command run, and no sponsored offer
 *    while a standard ad is already showing for the same wait.
 *
 * What is sent to the SDK: the session id, the interaction kind (always
 * WAIT here), optionally the estimated whole seconds left in the wait, and
 * the offer's server-issued displayEventId, nothing else. No command line, language, file path,
 * workspace info, source code or prompt content is ever passed.
 */

export { canClaimCompletionOnOpen, formatReward, rewardLabel } from "@devads/ad-sdk";

/** The bits of CommandTracker this module reads. */
export interface WaitSignal {
  elapsedSeconds(): number;
  isStillRunning(): boolean;
}

/**
 * The qualifying interaction this extension observes: a terminal command
 * that is still running. Explicitly the WAIT kind; it is active exactly as
 * long as the command runs.
 *
 * When `availableSeconds` is given (an estimate backed by the local
 * WaitEstimator), the interaction exposes it as its optional
 * availableSeconds() capability, which is what makes a VIDEO offer possible.
 * Without it the interaction has no such capability and only CARD offers
 * can be served, exactly as before video existed.
 */
export function terminalWait(
  tracker: Pick<WaitSignal, "isStillRunning">,
  availableSeconds?: () => number | undefined
): QualifyingInteraction {
  const interaction: QualifyingInteraction = { kind: "WAIT", isActive: () => tracker.isStillRunning() };
  return availableSeconds ? { ...interaction, availableSeconds } : interaction;
}

export interface SponsoredOfferView {
  show(offer: SponsoredOpportunity): void;
  hide(): void;
}

export type SessionLike = SessionProvider;

export interface SponsoredOfferDeps {
  getClient: () => SponsorshipApi | null;
  session: SessionLike;
  view: SponsoredOfferView;
  /** Opens the URL externally; resolves true only if it was actually opened. */
  openExternal: (url: string) => Promise<boolean>;
  /** User-facing, non-modal notice (reward earned). */
  notify?: (message: string) => void;
  /**
   * Origin of the DevAds web app (devads.webAppUrl). A CTA on this origin is
   * DevAds' own walkthrough, which needs the display id to verify completion.
   */
  getFirstPartyOrigin?: () => string | undefined;
  log?: (message: string) => void;
}

export interface OfferTickInput {
  /** devads.enabled AND devads.sponsorship.enabled. */
  enabled: boolean;
  minimumWaitSeconds: number;
  isSignedIn: boolean;
  /** True if the standard ad status bar item is currently showing an ad. */
  standardAdShowing: boolean;
  /**
   * Local estimate of whole seconds left in this wait (see WaitEstimator),
   * returning undefined when there is none. Becomes the terminal wait's
   * availableSeconds() capability; only the number is ever sent. Omitted
   * (video off, compact status-bar presentation, unknown command) means
   * the wait offers CARD presentation only.
   */
  availableSeconds?: () => number | undefined;
}

export class SponsoredOfferController {
  private readonly runtime: SponsoredOfferRuntime;
  /** Trackers whose current command run has already been considered for an offer. */
  private requested = new WeakSet<object>();

  constructor(private readonly deps: SponsoredOfferDeps) {
    this.runtime = new SponsoredOfferRuntime({
      getClient: deps.getClient,
      session: deps.session,
      host: {
        presentOffer: (offer) => deps.view.show(offer),
        dismissOffer: () => deps.view.hide(),
        openExternal: (url) => deps.openExternal(url),
        notify: (message) => deps.notify?.(message),
        log: (message) => deps.log?.(message),
      },
    });
  }

  getCurrent(): SponsoredOpportunity | null {
    return this.runtime.getCurrent();
  }

  /** Call when a new command starts in the tracker's terminal: that run may be considered once. */
  onCommandStart(tracker: object): void {
    this.requested.delete(tracker);
  }

  /** The wait is over: the offer goes away with it (never shown longer than the wait). */
  onCommandEnd(): void {
    this.runtime.interactionEnded();
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
      if (input.standardAdShowing) return;

      // A running terminal command is a WAIT-kind qualifying interaction.
      await this.runtime.offerDuring(terminalWait(tracker, input.availableSeconds));
    } catch {
      this.deps.log?.("sponsored offer tick failed: unexpected_error");
    }
  }

  /** Developer clicked the sponsored status bar item to see its details. */
  interact(): Promise<void> {
    return this.runtime.interact();
  }

  /** Developer explicitly skipped the offer. */
  skip(): Promise<void> {
    return this.runtime.skip();
  }

  /**
   * Developer explicitly chose to open the sponsor's link. Reports
   * OFFER_OPENED only if the link actually opened, then, if opening is the
   * offer's whole qualifying action, reports completion. Accepts the offer
   * explicitly so a notification opened before the command ended can still
   * act on the offer it was showing.
   */
  open(offer: SponsoredOpportunity | null = this.getCurrent()): Promise<void> {
    return this.runtime.open(offer && this.withFirstPartyLink(offer));
  }

  /**
   * DevAds' own walkthrough completes the offer in the browser, so it must
   * know which display it is for; without the ids it cannot verify anything.
   * Third-party CTAs are opened exactly as the server sent them.
   */
  private withFirstPartyLink(offer: SponsoredOpportunity): SponsoredOpportunity {
    const url = firstPartyOfferUrl(offer, this.deps.getFirstPartyOrigin?.(), this.deps.session.currentSessionId());
    return url ? { ...offer, ctaUrl: url.toString() } : offer;
  }
}
