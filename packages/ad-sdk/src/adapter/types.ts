import type { DevAdsClient } from "../client.js";
import type { QualifyingInteractionKind, SponsoredOpportunity } from "../types.js";

/**
 * The slice of DevAdsClient the adapter runtime drives. Declared as a Pick so
 * a host can pass the real client or a test double, and so the runtime
 * depends on method signatures rather than on how the client is built.
 */
export type ProtocolClient = Pick<
  DevAdsClient,
  "startSession" | "endSession" | "requestSponsoredOpportunity" | "reportOfferEvent" | "completeQualifyingAction"
>;

/**
 * Returns the client, or null when sponsorship is unavailable (not signed in,
 * no fetch in the host, disabled). May also throw; the runtime treats a
 * throwing factory the same as null.
 */
export type ProtocolClientProvider = () => ProtocolClient | null;

/**
 * One qualifying interaction within a development session: a moment the
 * host can already observe, without inspecting anything it does not own,
 * that gives it an opportunity to present a sponsored offer. A wait (a
 * terminal command still running, an agent turn in progress) is one kind;
 * the developer explicitly asking for an opportunity is another.
 *
 * The runtime asks only which kind it is (forwarded to the server, which
 * records it on the display) and whether it is still active (an offer is
 * presented only while it is). It never asks what the interaction is about.
 *
 * Capabilities are members of this interface, added as optional members so
 * existing hosts keep compiling. A capability belongs to what an
 * interaction can actually know, not to its kind: availableSeconds() exists
 * because some interactions (a terminal wait with a duration history) can
 * estimate how long they will last, and others (a developer clicking "show
 * me an opportunity") cannot.
 */
export interface QualifyingInteraction {
  /** Which kind of qualifying interaction this is. */
  readonly kind: QualifyingInteractionKind;
  /** True while an offer may still be presented for this interaction. */
  isActive(): boolean;
  /**
   * Optional: the host's estimate of whole seconds this interaction still
   * offers for presentation, or undefined when it has no estimate right now.
   * Omit it entirely for interactions with no time window. Only this number
   * is sent; the server serves a VIDEO offer only when one of its creatives
   * fits it, and the runtime re-checks the fit before presenting. Without it
   * the interaction is offered CARD presentation only.
   */
  availableSeconds?(): number | undefined;
}

/**
 * The pre-interaction-kind shape: a natural wait, identified only by
 * whether it is still active. Kept so hosts written against the Phase 6
 * runtime keep compiling; a WaitHandle is treated as a QualifyingInteraction
 * of kind WAIT. New hosts should pass a QualifyingInteraction.
 */
export interface WaitHandle {
  readonly kind?: "WAIT";
  isActive(): boolean;
}

/**
 * Everything host-specific about a DevAds client. An adapter for a new tool
 * implements this and nothing else; sessions, offer lifecycle, event
 * correlation, completion policy and failure handling come from the runtime.
 *
 * Presentation rules every host must follow (they are product properties,
 * not suggestions):
 *  - the offer is rendered in the host's own UI surface and visibly
 *    labelled "Sponsored";
 *  - it is never inserted into model prompts, system instructions, model
 *    output, generated code, source files, terminal input or any other
 *    developer content;
 *  - sponsor-provided text is rendered as untrusted text (escaped).
 */
export interface AdapterHost {
  /** Show the offer in the host's sponsored surface. */
  presentOffer(offer: SponsoredOpportunity): void;
  /** Remove the offer from the surface. Must be safe to call when nothing is shown. */
  dismissOffer(): void;
  /**
   * Open the sponsor's link outside the tool (the developer's browser).
   * Resolve true only if the host confirms it actually opened.
   */
  openExternal(url: string): Promise<boolean>;
  /** Non-modal, user-facing notice (e.g. a reward was earned). Optional. */
  notify?(message: string): void;
  /** Diagnostic log line. Receives only codes and reasons, never request contents. */
  log?(message: string): void;
}

/** What the runtime needs to know about the development session. Implemented by DevelopmentSessionManager. */
export interface SessionProvider {
  currentSessionId(): string | null;
  start(): Promise<string | null>;
  invalidate(): void;
}
