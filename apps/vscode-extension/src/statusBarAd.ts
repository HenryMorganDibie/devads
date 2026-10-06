import * as vscode from "vscode";
import type { AdCandidate } from "./adClient";

const AD_COMMANDS = ["devads.adClicked", "devads.adDismissed"];
const MAX_HEADLINE_CHARS = 60;

/** Status bar text must not let sponsor-provided text inject $(icon) codicons. */
function plain(text: string, max: number): string {
  const cleaned = text.replace(/\$\(/g, "(").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

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
    this.item.text = `$(megaphone) ${plain(ad.headline, MAX_HEADLINE_CHARS)}`;
    this.item.tooltip = this.buildTooltip(ad);
    this.item.show();
  }

  private buildTooltip(ad: AdCandidate): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    // Sponsor-provided text is escaped (appendText), and the tooltip trusts
    // only this surface's own two commands, so a creative can never embed a
    // link that runs any other command.
    md.isTrusted = { enabledCommands: AD_COMMANDS };
    md.appendMarkdown(`**SPONSORED**\n\n`);
    md.appendText(ad.headline);
    md.appendMarkdown(`\n\n`);
    if (ad.body) {
      md.appendText(ad.body);
      md.appendMarkdown(`\n\n`);
    }
    md.appendMarkdown(`[${escapeLinkText(ad.ctaLabel)}](command:devads.adClicked) &nbsp;&nbsp; [Dismiss](command:devads.adDismissed)\n\n`);
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

/** Escapes Markdown link-text metacharacters so a label cannot close the link or start a new one. */
export function escapeLinkText(text: string): string {
  return plain(text, 40).replace(/[\\`*_{}\[\]()#+\-.!<>|~]/g, (c) => `\\${c}`);
}
