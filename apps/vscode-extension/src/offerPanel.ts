import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import type { OfferPanelEvents, OfferPanelSurface } from "./offerPresentation";
import { attributionLabel, renderOfferPanelHtml } from "./offerPanelView";

export interface OfferPanelActions {
  /** The developer chose to open the offer shown in the panel. */
  open(offer: SponsoredOpportunity): void;
  /** The developer chose to skip the offer shown in the panel. */
  skip(offer: SponsoredOpportunity): void;
  log?(message: string): void;
}

const VIEW_TYPE = "devads.offerPanel";

/**
 * The DevAds offer panel: a webview beside the editor, opened without taking
 * focus, that presents any sponsored offer (CARD or VIDEO, see
 * offerPanelView.ts). It renders, and forwards the developer's Open / Skip
 * choice; everything else (events, completion, rewards) stays in the SDK
 * runtime via SponsoredOfferController.
 *
 * Only three messages are accepted from the page ("open", "skip",
 * "mediaError"), and Open / Skip act only on the offer currently rendered.
 */
export class WebviewOfferPanel implements OfferPanelSurface {
  private readonly panel: vscode.WebviewPanel;
  private offer: SponsoredOpportunity | null = null;
  private disposedByUs = false;

  constructor(private readonly actions: OfferPanelActions, events: OfferPanelEvents) {
    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "DevAds",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // No local resources at all: the panel loads nothing from the extension or workspace.
      { enableScripts: true, localResourceRoots: [] }
    );
    this.panel.webview.onDidReceiveMessage((msg: unknown) => this.onMessage(msg));
    this.panel.onDidDispose(() => {
      const byUs = this.disposedByUs;
      this.offer = null;
      if (!byUs) events.onClosedByUser();
    });
  }

  show(offer: SponsoredOpportunity, opts: { videoAllowed: boolean }): void {
    const html = renderOfferPanelHtml({ status: "offer", offer, videoAllowed: opts.videoAllowed }, nonce(), this.panel.webview.cspSource);
    this.offer = offer;
    this.panel.title = attributionLabel(offer);
    this.panel.webview.html = html;
    if (!this.panel.visible) this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  hide(): boolean {
    this.offer = null;
    // Don't yank away the tab the developer is reading: show the empty state
    // there instead and let them close it. Otherwise close the panel.
    if (this.panel.active) {
      this.panel.title = "DevAds";
      this.panel.webview.html = renderOfferPanelHtml({ status: "empty" }, nonce(), this.panel.webview.cspSource);
      return true;
    }
    this.dispose();
    return false;
  }

  dispose(): void {
    if (this.disposedByUs) return;
    this.disposedByUs = true;
    this.panel.dispose();
  }

  private onMessage(msg: unknown): void {
    const type = typeof msg === "object" && msg !== null ? (msg as { type?: unknown }).type : undefined;
    const offer = this.offer;
    if (type === "mediaError") {
      this.actions.log?.("sponsored video could not load; the panel shows the offer without it");
      return;
    }
    if (!offer) return;
    if (type === "open") this.actions.open(offer);
    else if (type === "skip") this.actions.skip(offer);
  }
}

function nonce(): string {
  return randomBytes(16).toString("base64");
}
