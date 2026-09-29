# First-party beta video ads

During the developer beta, DevAds is its own sponsor. It runs short video
campaigns for DevAds-owned projects on the same campaign, offer,
verification, ledger and wallet infrastructure that an external sponsor's
video campaign will use later. No YouTube (or any third-party) inventory is
used, and nothing implies an external sponsor.

| Product | Repository | What the video says |
| --- | --- | --- |
| Schema-Watch | [schema-watch](https://github.com/HenryMorganDibie/schema-watch) | Catches breaking API changes by diffing payload shape; fails the build; CI comments, check runs, SARIF |
| web-harvester | [web-harvester](https://github.com/HenryMorganDibie/web-harvester) | Self-hosted Go crawler; structured page data; blocks routed around, never bypassed; robots.txt by default |
| The Scribe | [the-scribe](https://github.com/HenryMorganDibie/the-scribe) | AI ghostwriter in the author's voice: voice interview, versioned voice profile, pgvector retrieval |
| DevAds | [devads](https://github.com/HenryMorganDibie/devads) | Sponsorship infrastructure; server-verified, idempotent ledger; no code, prompts, responses or secrets |

Every statement in the videos and on the product pages comes from the
product's own README. There are no metrics, customers or testimonials.

## The creatives

Twelve real cuts (1280x720, 30 fps, no audio track, readable with the sound
off), one 10 s, 15 s and 20 s cut per product, each as a VP9 WebM and an
H.264 MP4 of the same frames, plus a JPEG poster. WebM is the preferred
source because VS Code webviews (Electron) and other Chromium builds without
proprietary codecs cannot decode H.264; the MP4 is the fallback for players
without VP9. They are served by the web app from
`apps/web/public/beta-creatives/` and listed with sizes and SHA-256 hashes in
`manifest.json`.

Every frame carries a **DevAds Beta · First-party** badge and the line
"Created and funded by DevAds. Not an external sponsor.", plus a countdown
and progress bar. Each cut states what the product is, why a developer would
care, and ends on a CTA.

### How they are made

`tools/beta-creatives` renders them deterministically: `storyboards.mjs`
holds the copy and scene timings (checked to sum to exactly 10/15/20 s),
`stage.html` draws any frame as a pure function of time with motion
graphics, terminal and pipeline visuals, and `render.mjs` captures every
frame in headless Chromium and encodes it with ffmpeg (libx264, yuv420p,
`+faststart`).

```bash
cd tools/beta-creatives
npm install
node render.mjs --stills     # one PNG per scene, for review
node render.mjs              # all 12 cuts (MP4 + WebM) + posters + manifest.json
node render.mjs --transcode-only   # re-derive the WebM files from existing MP4s
npm run seed:beta -w @devads/database   # (from the repo root) sync creative rows
```

The tool is not a workspace package, so it adds nothing to the apps'
dependencies. Set `CHROMIUM_PATH` if Chromium is not at the default path.

### The README demo is separate

`docs/demo/devads-demo.{mp4,gif}` is a 25 s product demo of the whole
flow (build, offer, engagement, verification, wallet), rendered by
`render-demo.mjs` from `demo.html`. It embeds the real Schema-Watch 15 s
creative and real screenshots of the web app (`demo-assets/`). It is not a
campaign creative and is never served as an ad.

## How a video is delivered

The protocol carries the creative; no client hard-codes any video.

1. The client sends `availableWaitSeconds` with its offer request: its
   estimate of how much longer the current wait will last. The VS Code
   extension estimates it from how long the same command took before on this
   machine (the shortest recent run, so it errs short). Command lines are
   kept only locally, as SHA-256 hashes; only the number of seconds is sent.
   Developers can turn video off with `devads.sponsorship.video.enabled`.
2. A `VIDEO` offer (`SponsoredOffer.presentationMode`) is eligible only when
   one of its `OfferCreative` rows fits that window. The server serves the
   longest one that fits:

   | Available wait | Creative |
   | --- | --- |
   | under 10 s, or unknown | no video (a CARD offer may still be served) |
   | 10 to 14 s | 10 s |
   | 15 to 19 s | 15 s |
   | 20 s or more | 20 s |

3. The display event records which creative was served (`creativeId`, plus
   the window and length in its metadata) for auditing.
4. The offer response includes `presentationMode` and `creative` (`url`,
   `mimeType`, an optional `fallback` source, `posterUrl`, `durationSeconds`,
   `width`, `height`). Players list `url` first and `fallback` second. The SDK
   runtime re-checks on arrival and does not start a video that no longer
   fits.
5. The VS Code extension shows the offer in the status bar and, for a video,
   a webview beside the editor that opens without taking focus, starts
   muted, plays only https media under a strict CSP, and closes when the
   command finishes.

An offer's CTA may contain `{displayEventId}`, which the server replaces
with the display id, so the landing page can act on exactly that display.

## How the reward is earned

The video is the creative, not the qualifying action, and no player event
can earn anything: there is no "watched" event in the protocol. Each
campaign's qualifying action is DevAds-controlled:

1. Open the product page (`/beta/opportunity/<product>`) from the offer.
2. Spend at least 15 seconds on it. The server measures this from its own
   `OFFER_OPENED` event, not from the browser.
3. Confirm. The completion runs through the same idempotent, row-locked
   transaction as every campaign, and grants 25 Beta Credits labelled
   `rewardSource = DEVADS_BETA`, `campaignMode = BETA`.

Caps per product: 1 reward per day, 2 lifetime, 3 displays per day. Beta
Credits are not cash and cannot be redeemed.

## The same path for external sponsors later

Nothing here is beta-only. An external sponsor's video campaign is the same
thing with `mode = LIVE`: a funded campaign, a `VIDEO` offer with
`OfferCreative` rows, the same window-fitting selection, the same verified
qualifying action, a real sponsor charge and a real reward. New creative
types extend `CreativeKind` without changing the offer shape. What does not
exist yet is sponsor self-service upload of video creatives in the sponsor
dashboard; today creatives are added by the seed or an operator.
