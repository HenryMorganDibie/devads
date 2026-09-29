import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import type { SponsoredOfferView } from "./sponsoredOffer";
import { playableCreative, renderVideoOfferHtml } from "./videoOfferView";

/**
 * Presents VIDEO offers: the existing status bar item plus, for an offer
 * whose creative is playable, a webview beside the editor that plays the
 * creative the server chose for this wait. It opens without taking focus,
 * starts muted, and closes when the wait ends, so the developer's work is
 * never interrupted. CARD offers use the status bar item only.
 */
export class SponsoredOfferSurfaces implements SponsoredOfferView, vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private shownId: string | null = null;

  constructor(
    private readonly statusBar: SponsoredOfferView,
    private readonly actions: { open: (offer: SponsoredOpportunity) => void; skip: () => void },
    private readonly videoEnabled: () => boolean
  ) {}

  show(offer: SponsoredOpportunity): void {
    this.statusBar.show(offer);
    if (!this.videoEnabled() || !playableCreative(offer)) return;
    this.closePanel();
    const panel = vscode.window.createWebviewPanel(
      "devads.videoOffer",
      offer.campaignMode === "BETA" ? "DevAds Beta · First-party" : "Sponsored",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [] }
    );
    const nonce = randomBytes(16).toString("base64");
    panel.webview.html = renderVideoOfferHtml(offer, nonce, panel.webview.cspSource);
    panel.webview.onDidReceiveMessage((msg: { type?: unknown }) => {
      if (msg?.type === "open") this.actions.open(offer);
      else if (msg?.type === "skip") this.actions.skip();
    });
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = null;
    });
    this.panel = panel;
    this.shownId = offer.displayEventId;
  }

  hide(): void {
    this.statusBar.hide();
    this.closePanel();
  }

  private closePanel() {
    const p = this.panel;
    this.panel = null;
    this.shownId = null;
    p?.dispose();
  }

  dispose(): void {
    this.closePanel();
  }
}
