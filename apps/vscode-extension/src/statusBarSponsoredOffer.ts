import * as vscode from "vscode";
import type { SponsoredOpportunity } from "@devads/ad-sdk";
import { formatReward, type SponsoredOfferView } from "./sponsoredOffer";

export const SHOW_OFFER_COMMAND = "devads.sponsorship.showOffer";
export const OPEN_OFFER_COMMAND = "devads.sponsorship.openOffer";
export const SKIP_OFFER_COMMAND = "devads.sponsorship.skipOffer";

const MAX_TITLE_CHARS = 40;

/** DevAds' own beta campaigns are never labelled as sponsored by someone else. */
export function offerLabel(offer: Pick<SponsoredOpportunity, "campaignMode">): string {
  return offer.campaignMode === "BETA" ? "DevAds Beta" : "Sponsored";
}

/** Status bar text must not let sponsor-provided text inject $(icon) codicons. */
function plain(text: string, max: number): string {
  const cleaned = text.replace(/\$\(/g, "(").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

/**
 * Status bar surface for a sponsored OFFER (the sponsorship domain). This is
 * deliberately a separate item from StatusBarAd (standard ads), with its own
 * commands, so the two ad types are never conflated. Always labelled
 * "Sponsored" and always shows the reward on offer.
 *
 * Sponsor-provided text is rendered with appendText (escaped), and the
 * tooltip only trusts this surface's own open/skip commands.
 */
export class StatusBarSponsoredOffer implements SponsoredOfferView, vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.item.command = SHOW_OFFER_COMMAND;
    this.item.name = "DevAds Sponsored Offer";
  }

  show(offer: SponsoredOpportunity): void {
    const video = offer.presentationMode === "VIDEO" ? "$(play) " : "";
    this.item.text = `$(gift) ${video}${offerLabel(offer)}: ${plain(offer.title, MAX_TITLE_CHARS)} · ${formatReward(
      offer.rewardType,
      offer.rewardAmountUnits
    )}`;
    this.item.tooltip = this.buildTooltip(offer);
    this.item.show();
  }

  private buildTooltip(offer: SponsoredOpportunity): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = { enabledCommands: [OPEN_OFFER_COMMAND, SKIP_OFFER_COMMAND] };
    md.appendMarkdown(offer.campaignMode === "BETA" ? `**DEVADS BETA OPPORTUNITY · FIRST-PARTY**\n\n` : `**SPONSORED OFFER**\n\n`);
    md.appendMarkdown(`**`);
    md.appendText(offer.title);
    md.appendMarkdown(`**\n\n`);
    md.appendText(offer.description);
    md.appendMarkdown(`\n\n`);
    md.appendText(`Reward: ${formatReward(offer.rewardType, offer.rewardAmountUnits)}`);
    md.appendMarkdown(`\n\n`);
    if (offer.requiredAction) {
      md.appendText(`To earn it: ${offer.requiredAction}`);
      md.appendMarkdown(`\n\n`);
    }
    md.appendMarkdown(`[View offer](command:${OPEN_OFFER_COMMAND}) &nbsp;&nbsp; [Skip](command:${SKIP_OFFER_COMMAND})\n\n`);
    md.appendMarkdown(offer.campaignMode === "BETA" ? `*Created and funded by DevAds. Not an external sponsor.*` : `*Sponsored*`);
    return md;
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
