import type { OfferCreative, SponsoredOpportunity } from "@devads/ad-sdk";
import { formatReward } from "./sponsoredOffer";

/**
 * Pure HTML for the DevAds offer panel (a webview beside the editor). It is
 * the general DevAds-owned presentation surface: a CARD offer renders as a
 * headline / body / reward / call to action, a VIDEO offer adds a player for
 * the creative the server chose. Future presentation modes add a renderer
 * here; the shell (CSP, attribution label, reward line, buttons) is shared.
 *
 * Nothing here is specific to any product or campaign: the creative, its
 * length, the copy, the reward and the qualifying action all come from the
 * offer the server served. The extension ships no video files.
 *
 * Security posture, identical for every state and mode:
 *  - CSP `default-src 'none'`; inline style and script only with a nonce;
 *    media and images only from the creative's own origins (none at all for
 *    a CARD offer) plus the webview's own resource origin for images.
 *  - Every server-provided string is HTML-escaped. The CTA URL is never put
 *    in the page: the page can only post "open", "skip" or "mediaError", and
 *    the extension opens the offer's link itself.
 *  - Only https media (or http on localhost, for development) is embedded.
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
export function playableCreative(offer: SponsoredOpportunity): OfferCreative | null {
  if (offer.presentationMode !== "VIDEO" || !offer.creative) return null;
  if (offer.creative.kind !== "VIDEO" || !isPlayableCreativeUrl(offer.creative.url)) return null;
  if (offer.creative.posterUrl && !isPlayableCreativeUrl(offer.creative.posterUrl)) return null;
  if (offer.creative.fallback && !isPlayableCreativeUrl(offer.creative.fallback.url)) return null;
  return offer.creative;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Whether the offer is DevAds' own (first-party beta) campaign rather than an external sponsor's. */
export function isFirstParty(offer: Pick<SponsoredOpportunity, "campaignMode">): boolean {
  return offer.campaignMode === "BETA";
}

/** The attribution label every surface shows. DevAds' own campaigns are never labelled as sponsored by someone else. */
export function attributionLabel(offer: Pick<SponsoredOpportunity, "campaignMode">): string {
  return isFirstParty(offer) ? "DevAds Beta · First-party" : "Sponsored";
}

function fundingLine(offer: SponsoredOpportunity): string {
  return isFirstParty(offer)
    ? "Created and funded by DevAds as part of the developer beta. Not an external sponsor."
    : "Sponsored content, shown because you opted in to sponsorships.";
}

function rewardLine(offer: SponsoredOpportunity): string {
  const reward = formatReward(offer.rewardType, offer.rewardAmountUnits);
  return offer.requiredAction ? `To earn ${esc(reward)}: ${esc(offer.requiredAction)}.` : `Open the offer to earn ${esc(reward)}.`;
}

/**
 * What the panel shows. Loading and error states for media live inside the
 * VIDEO page (a "Loading video..." status until the first frame; an inline
 * error that keeps the offer usable if no source can play). A panel that
 * cannot be created or rendered at all is handled one level up, by falling
 * back to the status bar (see OfferPresentationController).
 */
export type OfferPanelState = { status: "offer"; offer: SponsoredOpportunity; videoAllowed: boolean } | { status: "empty" };

/** The presentation an offer gets in the panel: VIDEO only with a playable creative and video allowed, otherwise CARD. */
export function panelPresentation(offer: SponsoredOpportunity, videoAllowed: boolean): "VIDEO" | "CARD" {
  return videoAllowed && playableCreative(offer) ? "VIDEO" : "CARD";
}

function shell(opts: { nonce: string; cspSource: string; mediaOrigins: string[]; body: string; script?: string }): string {
  const media = opts.mediaOrigins.join(" ");
  const csp = [
    "default-src 'none'",
    media ? `media-src ${media}` : null,
    `img-src ${media ? `${media} ` : ""}${opts.cspSource}`,
    `style-src 'nonce-${opts.nonce}'`,
    `script-src 'nonce-${opts.nonce}'`,
  ]
    .filter(Boolean)
    .join("; ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp};" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style nonce="${opts.nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
  .label { display: inline-block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; border: 1px solid var(--vscode-focusBorder); color: var(--vscode-textLink-foreground); border-radius: 4px; padding: 2px 6px; }
  .media { position: relative; max-width: 960px; margin-top: 12px; }
  video { width: 100%; height: auto; background: #000; border-radius: 8px; display: block; }
  .status { margin: 8px 0 0; font-size: 12px; opacity: .8; }
  .status.error { color: var(--vscode-errorForeground); opacity: 1; }
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
${opts.body}
${opts.script ? `<script nonce="${opts.nonce}">\n${opts.script}\n</script>` : ""}
</body>
</html>`;
}

// "engaged" tells the extension the developer is actually reading the panel
// (focused or clicked it), so it is not closed under them when the offer ends.
const ACTIONS_SCRIPT = `  const vscode = acquireVsCodeApi();
  document.getElementById("open").addEventListener("click", () => vscode.postMessage({ type: "open" }));
  document.getElementById("skip").addEventListener("click", () => vscode.postMessage({ type: "skip" }));
  const engaged = () => vscode.postMessage({ type: "engaged" });
  window.addEventListener("focus", engaged);
  document.addEventListener("pointerdown", engaged);`;

// Loading -> playing, or -> an inline error that keeps the offer usable. A
// <source> fires "error" when it fails; the last one failing means none can play.
const VIDEO_SCRIPT = `  const video = document.getElementById("video");
  const status = document.getElementById("media-status");
  video.addEventListener("loadeddata", () => { status.hidden = true; });
  const sources = video.querySelectorAll("source");
  sources[sources.length - 1].addEventListener("error", () => {
    video.remove();
    status.textContent = "The video could not load. The offer details are below.";
    status.className = "status error";
    status.hidden = false;
    vscode.postMessage({ type: "mediaError" });
  });`;

function offerBody(offer: SponsoredOpportunity, mediaHtml: string, note: string): string {
  const openLabel = isFirstParty(offer) ? "Open project page" : "Open offer";
  return `  <span class="label">${esc(attributionLabel(offer))}</span>
${mediaHtml}  <h1>${esc(offer.title)}</h1>
  <p>${esc(offer.description)}</p>
  <p><strong>${rewardLine(offer)}</strong></p>
  <p class="muted">${note} ${esc(fundingLine(offer))}</p>
  <div class="row"><button class="primary" id="open">${openLabel}</button><button class="secondary" id="skip">Skip</button></div>`;
}

/** A CARD offer: headline, body, reward line and call to action. No media, so the CSP allows none. */
export function renderCardOfferHtml(offer: SponsoredOpportunity, nonce: string, cspSource: string): string {
  return shell({
    nonce,
    cspSource,
    mediaOrigins: [],
    body: offerBody(offer, "", "The reward requires the action above, verified by DevAds."),
    script: ACTIONS_SCRIPT,
  });
}

/**
 * A VIDEO offer: the CARD content plus a muted, autoplaying player for the
 * server-chosen creative, with a loading state until the first frame and an
 * inline error state if no source can play. Throws for an offer without a
 * playable creative; use renderOfferPanelHtml() to fall back to CARD.
 */
export function renderVideoOfferHtml(offer: SponsoredOpportunity, nonce: string, cspSource: string): string {
  const creative = playableCreative(offer);
  if (!creative) throw new Error("not a playable video offer");
  const origins = new Set([new URL(creative.url).origin]);
  if (creative.fallback) origins.add(new URL(creative.fallback.url).origin);
  if (creative.posterUrl) origins.add(new URL(creative.posterUrl).origin);
  const mediaHtml = `  <div class="media">
  <video id="video"${creative.posterUrl ? ` poster="${esc(creative.posterUrl)}"` : ""} autoplay muted playsinline controls preload="auto" width="${creative.width}" height="${creative.height}">
    <source src="${esc(creative.url)}" type="${esc(creative.mimeType)}" />${
      creative.fallback ? `\n    <source src="${esc(creative.fallback.url)}" type="${esc(creative.fallback.mimeType)}" />` : ""
    }
  </video>
  <p class="status" id="media-status" role="status">Loading video...</p>
  </div>
`;
  return shell({
    nonce,
    cspSource,
    mediaOrigins: [...origins],
    body: offerBody(
      offer,
      mediaHtml,
      "Watching the video does not earn anything; the reward requires the action above, verified by DevAds."
    ),
    script: `${ACTIONS_SCRIPT}\n${VIDEO_SCRIPT}`,
  });
}

/** Any panel state. Never throws: a VIDEO offer that cannot play renders as CARD. */
export function renderOfferPanelHtml(state: OfferPanelState, nonce: string, cspSource: string): string {
  if (state.status === "offer") {
    return panelPresentation(state.offer, state.videoAllowed) === "VIDEO"
      ? renderVideoOfferHtml(state.offer, nonce, cspSource)
      : renderCardOfferHtml(state.offer, nonce, cspSource);
  }
  return shell({
    nonce,
    cspSource,
    mediaOrigins: [],
    body: `  <span class="label">DevAds</span>
  <h1>No sponsored opportunity right now</h1>
  <p class="muted">The last one is no longer available: it ended with the command it was shown during, or you already opened or skipped it. You can close this tab; DevAds opens it again beside your editor, without taking focus, the next time an opportunity fits.</p>`,
  });
}
