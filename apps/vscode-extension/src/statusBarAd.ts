import * as vscode from "vscode";
import type { AdCandidate } from "./adClient";

/**
 * Renders the current ad as a compact StatusBarItem -- per VS Code's own
 * UX guidance against using a webview for promotional content. Clicking
 * it runs the "Learn more" command; the item disappears the instant the
 * command ends, is dismissed, or a new command's ad replaces it.
 */
export class StatusBarAd implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private current: AdCandidate | null = null;
  private shownAt = 0;

  constructor(private readonly onLearnMore: (ad: AdCandidate) => void, private readonly onDismiss: (ad: AdCandidate) => void) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "devads.adClicked";
  }

  show(ad: AdCandidate): void {
    this.current = ad;
    this.shownAt = Date.now();
    this.item.text = `$(megaphone) ${ad.headline}`;
    this.item.tooltip = this.buildTooltip(ad);
    this.item.show();
  }

  private buildTooltip(ad: AdCandidate): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**SPONSORED**\n\n`);
    md.appendMarkdown(`${ad.headline}\n\n`);
    if (ad.body) md.appendMarkdown(`${ad.body}\n\n`);
    md.appendMarkdown(`[${ad.ctaLabel}](command:devads.adClicked) &nbsp;&nbsp; [Dismiss](command:devads.adDismissed)\n\n`);
    md.appendMarkdown(`*Sponsored*`);
    return md;
  }

  /** How long the ad has been visible, for view-duration reporting. */
  viewDurationMs(): number {
    return this.shownAt > 0 ? Date.now() - this.shownAt : 0;
  }

  getCurrent(): AdCandidate | null {
    return this.current;
  }

  hide(): void {
    this.current = null;
    this.shownAt = 0;
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
