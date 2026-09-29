import type { DevAdsClient } from "../client.js";
import type { SponsoredOpportunity } from "../types.js";

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
 * A natural wait the host can already observe without inspecting anything
 * it does not own: a terminal command still running, an agent turn still in
 * progress, a build the tool itself started. The runtime only asks whether
 * it is still active, never what it is.
 */
export interface WaitHandle {
  isActive(): boolean;
  /**
   * The host's estimate of whole seconds left in this wait, or undefined
   * when it has no estimate. Only this number is sent to the server, which
   * serves a video offer only when a creative fits it.
   */
  availableSeconds?(): number | undefined;
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
