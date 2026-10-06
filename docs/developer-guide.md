# Developer Guide

## Install

1. Sign in at https://devads-app.vercel.app (GitHub or Google), accept the
   beta terms and opt in to sponsorships. See
   [developer-beta.md](./developer-beta.md).
2. Download the extension from the **VS Code extension** card on your
   dashboard (`/app`), or build it with `npm run package -w devads`
   (`apps/vscode-extension/devads-0.1.0.vsix`).
3. In VS Code: **Extensions → ... → Install from VSIX**, select the file.
4. Run **DevAds: Sign In** from the command palette. It shows a short code
   and a link; enter the code on the `/device` page while signed in on the
   web. Sign-in completes on its own once the code is approved.

The extension uses the production API (`https://devads-api.vercel.app`) and
site (`https://devads-app.vercel.app`) by default. For a local stack, set
`devads.adServerUrl` to `http://localhost:4000` and `devads.webAppUrl` to
`http://localhost:3000` in VS Code settings.

## What you'll see

Nothing, most of the time. DevAds only considers showing anything when:

- a terminal command has been running for at least `devads.minimumWaitSeconds`
  (default 8s), **and**
- it's still running when the server responds, **and**
- the server has an eligible offer or campaign for you.

If your build takes 3 seconds, you'll never see anything. Whatever is shown
ends the moment the command finishes, fails or is cancelled.

### Sponsored offers in the DevAds panel

Sponsored offers come from the sponsorship API through `@devads/ad-sdk` and
open in the **DevAds panel**, a DevAds-owned tab beside the editor. It opens
without taking focus, so you keep typing in the terminal or editor.

- **Card:** an attribution label, title, description, the reward and what
  earns it, then **Open** and **Skip**.
- **Video:** the same card plus a muted, autoplaying player. Video is used
  only when a creative fits the time the command is expected to keep
  running: 10, 15 or 20 seconds, never longer than the estimate. The
  estimate is the shortest recent run of the same command on this machine,
  so the first run of a command never gets video; commands are remembered
  only locally, as SHA-256 hashes, and only the number of seconds is sent.
  If the video cannot load, the panel says so and the offer stays usable.
- **When the command ends** the offer ends with it and any video stops. The
  panel closes, unless you clicked into it; then it shows an empty state you
  can close. Closing the panel yourself while an offer is live is not a skip:
  the offer moves to the status bar instead.

Labels: a sponsor's offer is labelled **Sponsored**. DevAds' own beta
campaigns are labelled **DevAds Beta · First-party** and say they are created
and funded by DevAds, not an external sponsor.

What earns a reward:

- **Open** opens the offer's page in your browser (VS Code may ask you to
  confirm opening an external website). Watching a video earns nothing.
- If the offer names no further action, opening it is the action, and the
  server decides whether you earn the reward.
- If it names one (shown as "To earn ..."), the extension does not track it.
  For DevAds' own offers the page is on the DevAds site: spend at least 15
  seconds on it, then confirm. The server checks the time from its own
  records and pays at most once per display.
- **DevAds: Show Reward Wallet** lists your available and pending reward
  units per reward type. Beta Credits are not cash and cannot be redeemed.

Compact mode: set `devads.sponsorship.presentation` to `statusBar` to get a
single status bar item labelled with the same attribution instead of the
panel (text only, never video). Click it for **View offer** / **Skip**. The
status bar is also the fallback when the panel cannot open.

### Standard sponsored cards

DevAds also serves standard CPM cards: a compact status bar item with the
sponsor's headline, its call to action and **Dismiss**. If a standard card is
already showing for a wait, no sponsored offer is shown for that wait.

## Settings

Search "DevAds" in VS Code settings:

- `devads.enabled` -- master on/off switch.
- `devads.minimumWaitSeconds` -- how long a command must run before anything
  is considered.
- `devads.sponsorship.enabled` -- turns sponsored offers and the reward
  session off without uninstalling (default on). Offers also need
  `devads.enabled`, and your dashboard opt-in is still enforced by the
  server.
- `devads.sponsorship.presentation` -- `panel` (default) or `statusBar`.
- `devads.sponsorship.video.enabled` -- allow video offers in the panel
  (default on). Off means card offers only, and no wait estimate is sent.
- `devads.categories` / `devads.categoriesOptOut` -- not applied yet: the
  extension does not send them. Category preferences are stored on your
  DevAds account and enforced by the server.
- `devads.telemetryEnabled` -- see [privacy.md](./privacy.md) for exactly
  what this controls.
- `devads.videoAdsEnabled` -- not used; kept only so existing settings don't
  error. Video is controlled by `devads.sponsorship.video.enabled`.

## Earnings and rewards

- **Rewards** from sponsored offers are on `/app/wallet` and in **DevAds:
  Show Reward Wallet**.
- **Standard card earnings** (CPM) are on the
  [developer dashboard](https://devads-app.vercel.app/dashboard): today /
  this week / this month / lifetime, impressions and clicks, and payout
  history with a **Withdraw** button once your balance clears the minimum
  payout threshold. They reflect qualified views only (a minimum view
  duration is required) and are not guaranteed: they depend on advertiser
  demand and your usage.

## Uninstalling / disabling

- **DevAds: Disable** from the command palette, or turn sponsorships off in
  the web dashboard. The dashboard opt-out is enforced server-side.
- Uninstall the extension like any other VS Code extension.
- Delete your account and data any time from the dashboard.
