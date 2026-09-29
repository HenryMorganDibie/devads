import type { SponsoredOpportunity } from "@devads/ad-sdk";
import { formatReward } from "./sponsoredOffer";

/**
 * Pure helpers for presenting a VIDEO offer in a webview. Nothing here is
 * specific to any product or campaign: the creative, its length, the copy,
 * the reward and the qualifying action all come from the offer the server
 * served. The extension ships no video files.
 */

/** Only https media (or http on localhost, for local development) is ever embedded. */
export function isPlayableCreativeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/** The creative to play, or null when the offer is not a playable VIDEO offer. */
export function playableCreative(offer: SponsoredOpportunity) {
  if (offer.presentationMode !== "VIDEO" || !offer.creative) return null;
  if (offer.creative.kind !== "VIDEO" || !isPlayableCreativeUrl(offer.creative.url)) return null;
  if (offer.creative.posterUrl && !isPlayableCreativeUrl(offer.creative.posterUrl)) return null;
  if (offer.creative.fallback && !isPlayableCreativeUrl(offer.creative.fallback.url)) return null;
  return offer.creative;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Whether the offer is DevAds' own (first-party beta) campaign rather than an external sponsor's. */
function isFirstParty(offer: SponsoredOpportunity) {
  return offer.campaignMode === "BETA";
}

/**
 * The webview document. Strict CSP: no network access except the creative's
 * own origin for media and poster, inline script/style only with a nonce,
 * and the only messages the page can send are "open" and "skip".
 */
export function renderVideoOfferHtml(offer: SponsoredOpportunity, nonce: string, cspSource: string): string {
  const creative = playableCreative(offer);
  if (!creative) throw new Error("not a playable video offer");
  const origins = new Set([new URL(creative.url).origin]);
  if (creative.fallback) origins.add(new URL(creative.fallback.url).origin);
  if (creative.posterUrl) origins.add(new URL(creative.posterUrl).origin);
  const media = [...origins].join(" ");
  const label = isFirstParty(offer) ? "DevAds Beta · First-party" : "Sponsored";
  const funding = isFirstParty(offer)
    ? "Created and funded by DevAds as part of the developer beta. Not an external sponsor."
    : "Sponsored content, shown because you opted in to sponsorships.";
  const reward = formatReward(offer.rewardType, offer.rewardAmountUnits);
  const action = offer.requiredAction ? `To earn ${esc(reward)}: ${esc(offer.requiredAction)}.` : `Open the offer to earn ${esc(reward)}.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${media}; img-src ${media} ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
  .label { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; border: 1px solid var(--vscode-focusBorder); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 2px 6px; }
  video { width: 100%; max-width: 960px; aspect-ratio: ${creative.width} / ${creative.height}; background: #000; border-radius: 8px; margin-top: 12px; display: block; }
  h1 { font-size: 15px; margin: 14px 0 6px; }
  p { margin: 6px 0; line-height: 1.45; max-width: 960px; }
  .muted { opacity: .75; font-size: 12px; }
  .row { display: flex; gap: 8px; margin-top: 14px; }
  button { font: inherit; padding: 6px 14px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; }
  .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
</style>
</head>
<body>
  <span class="label">${esc(label)}</span>
  <video${creative.posterUrl ? ` poster="${esc(creative.posterUrl)}"` : ""} autoplay muted playsinline controls preload="auto">
    <source src="${esc(creative.url)}" type="${esc(creative.mimeType)}" />${
      creative.fallback ? `\n    <source src="${esc(creative.fallback.url)}" type="${esc(creative.fallback.mimeType)}" />` : ""
    }
  </video>
  <h1>${esc(offer.title)}</h1>
  <p>${esc(offer.description)}</p>
  <p><strong>${action}</strong></p>
  <p class="muted">Watching the video does not earn anything; the reward requires the action above, verified by DevAds. ${esc(funding)}</p>
  <div class="row"><button class="primary" id="open">Open project page</button><button class="secondary" id="skip">Skip</button></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById("open").addEventListener("click", () => vscode.postMessage({ type: "open" }));
  document.getElementById("skip").addEventListener("click", () => vscode.postMessage({ type: "skip" }));
</script>
</body>
</html>`;
}
