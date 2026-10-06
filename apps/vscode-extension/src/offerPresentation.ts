import type { SponsoredOpportunity } from "@devads/ad-sdk";
import type { SponsoredOfferView } from "./sponsoredOffer";

/**
 * Where sponsored offers are presented (setting `devads.sponsorship.presentation`):
 *  - "panel" (default): the DevAds offer panel, a webview beside the editor
 *    that opens without taking focus. Every presentation mode renders there
 *    (CARD as a headline / body / reward / call to action, VIDEO with a
 *    player). The status bar item is the fallback.
 *  - "statusBar": compact mode. The status bar item only, exactly as before
 *    the panel existed; the extension then also reports no available
 *    seconds, so the server serves CARD offers only.
 */
export type PresentationPreference = "panel" | "statusBar";

export const DEFAULT_PRESENTATION: PresentationPreference = "panel";

/** Reads the setting defensively: anything but "statusBar" is the default panel. */
export function parsePresentationPreference(value: unknown): PresentationPreference {
  return value === "statusBar" ? "statusBar" : DEFAULT_PRESENTATION;
}

/** The DevAds panel as the controller sees it (implemented over a VS Code webview in offerPanel.ts). */
export interface OfferPanelSurface {
  /**
   * Shows the offer, CARD or VIDEO (VIDEO only when `videoAllowed` and the
   * creative is playable). Throws if the panel cannot render it; the
   * controller then falls back to the status bar.
   */
  show(offer: SponsoredOpportunity, opts: { videoAllowed: boolean }): void;
  /**
   * The offer is gone (its interaction ended, or it was skipped or opened).
   * Returns true if the panel stays open showing its empty state (it was the
   * tab the developer was looking at, so it is not yanked away), false if it
   * closed itself.
   */
  hide(): boolean;
  dispose(): void;
}

export interface OfferPanelEvents {
  /** The developer closed the panel while it may still have been showing an offer. */
  onClosedByUser(): void;
}

export interface OfferPresentationDeps {
  /** The compact surface and fallback: the existing StatusBarSponsoredOffer. */
  statusBar: SponsoredOfferView;
  /** Creates the panel. May throw (webviews unavailable in this host, for example). */
  createPanel: (events: OfferPanelEvents) => OfferPanelSurface;
  preference: () => PresentationPreference;
  /** devads.sponsorship.video.enabled: whether the panel may play VIDEO creatives. */
  videoAllowed: () => boolean;
  log?: (message: string) => void;
}

export type ActiveSurface = "panel" | "statusBar" | null;

/**
 * Chooses the surface for each offer: the panel first (in panel mode), the
 * status bar when compact mode is configured, the panel cannot be created
 * or cannot render the offer, or the developer closes the panel while the
 * offer is still live. Exactly one surface shows an offer at a time.
 *
 * Presentation only: it never reports events, never decides rewards and
 * never chooses the presentation mode or creative (the server does). It
 * implements SponsoredOfferView, so the offer lifecycle in
 * SponsoredOfferController is unchanged whichever surface is used.
 */
export class OfferPresentationController implements SponsoredOfferView {
  private panel: OfferPanelSurface | null = null;
  private current: SponsoredOpportunity | null = null;
  private active: ActiveSurface = null;

  constructor(private readonly deps: OfferPresentationDeps) {}

  /** Which surface is showing the current offer, if any. */
  activeSurface(): ActiveSurface {
    return this.active;
  }

  show(offer: SponsoredOpportunity): void {
    this.current = offer;
    if (this.deps.preference() === "statusBar") {
      // Compact mode: exactly the pre-panel behavior. A panel left over from
      // before the setting changed is closed.
      this.closePanel();
      this.showOnStatusBar(offer);
      return;
    }
    try {
      if (!this.panel) this.panel = this.deps.createPanel({ onClosedByUser: () => this.panelClosedByUser() });
      this.panel.show(offer, { videoAllowed: this.safe(this.deps.videoAllowed, false) });
      // One surface at a time: the panel replaces, not stacks on, the status bar.
      this.deps.statusBar.hide();
      this.active = "panel";
    } catch (err) {
      this.log(`offer panel unavailable, using the status bar: ${err instanceof Error ? err.name : "error"}`);
      this.closePanel();
      this.showOnStatusBar(offer);
    }
  }

  hide(): void {
    this.current = null;
    this.active = null;
    this.deps.statusBar.hide();
    const panel = this.panel;
    if (!panel) return;
    let stillOpen = false;
    try {
      stillOpen = panel.hide();
    } catch {
      stillOpen = false;
    }
    if (!stillOpen) this.panel = null;
  }

  dispose(): void {
    this.current = null;
    this.active = null;
    this.closePanel();
  }

  private panelClosedByUser(): void {
    this.panel = null;
    // Closing the panel is not a skip (only the Skip button reports one). The
    // offer stays reachable, compactly, until its interaction ends.
    if (this.current && this.active === "panel") this.showOnStatusBar(this.current);
  }

  private showOnStatusBar(offer: SponsoredOpportunity): void {
    this.deps.statusBar.show(offer);
    this.active = "statusBar";
  }

  private closePanel(): void {
    const panel = this.panel;
    this.panel = null;
    try {
      panel?.dispose();
    } catch {
      // A broken panel must not break the fallback.
    }
  }

  private safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  private log(message: string): void {
    try {
      this.deps.log?.(message);
    } catch {
      // ignore
    }
  }
}
