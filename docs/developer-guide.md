# Developer Guide

> **Note:** the README's card preview is a static mockup. Nobody has yet
> sat down in a real Extension Development Host, run `node
> scripts/demo-wait.js 30`, and watched the actual card appear/disappear
> with fresh eyes -- that pass (does it read as sponsored at a glance,
> does dismiss/click actually work, does it vanish the instant the command
> ends) is still open and matters more than any further backend work. If
> you're reading this and about to try it, that first real run *is* the
> test -- no separate setup needed beyond the steps below.

## Install

1. `npm run package -w @devads/vscode-extension` to build `devads-0.1.0.vsix`
   (or download it from a release once published to the Marketplace).
2. In VS Code: **Extensions → ... → Install from VSIX**, select the file.
3. Run **DevAds: Sign In** from the command palette. You'll see a short code
   and a link -- open it, sign in (or create an account) on the DevAds web
   app, and enter the code to approve the connection.

## What you'll see

Nothing, most of the time. DevAds only ever shows a small sponsored card in
the status bar, and only when:

- a terminal command has been running for at least `devads.minimumWaitSeconds`
  (default 8s), **and**
- it's still running when the ad-server responds, **and**
- there's an eligible campaign for your detected language/runtime/platform.

The card disappears the instant the command finishes, fails, or is
cancelled. If your build takes 3 seconds, you'll never see an ad.

### Sponsored offers with rewards

On the same kind of wait, the extension may instead show a **sponsored
offer**: a separate status bar item labelled "Sponsored" with a title, a
short description and a reward (for example "50 units (AI credits)").
Offers come from the sponsorship API through `@devads/ad-sdk`. If a regular
sponsored card is already showing for a wait, no offer is shown for that
wait. Like the card, an offer disappears when the command ends.

- Click the item (or hover it) to **View offer** or **Skip**.
- **View offer** opens the sponsor's link. Opening it is the only action the
  extension counts. If the offer has no further required action, that
  counts as completing it and the server decides whether you earn the
  reward. If the sponsor asks for something more (shown as "To earn it:"),
  the extension does not track it and does not claim the reward.
- **DevAds: Show Reward Wallet** lists your available and pending reward
  units per reward type.

Offers send only the extension's client type and version plus session and
offer ids. They don't use your language, platform or command name.

## Settings

Search "DevAds" in VS Code settings:

- `devads.enabled` -- master on/off switch.
- `devads.minimumWaitSeconds` -- how long a command must run before an ad is
  even considered.
- `devads.categories` / `devads.categoriesOptOut` -- allow/block specific ad
  categories.
- `devads.telemetryEnabled` -- see [privacy.md](./privacy.md) for exactly
  what this controls.
- `devads.videoAdsEnabled` -- reserved; the v1 status-bar surface doesn't
  render video yet.
- `devads.sponsorship.enabled` -- turns sponsored offers and the reward
  session off without uninstalling (default on). Offers also need
  `devads.enabled`, and your dashboard opt-in is still enforced by the
  server.

## Earnings

Sign in to the [developer dashboard](http://localhost:3000/dashboard) (or
your deployed DevAds URL) to see:

- Today / this week / this month / lifetime earnings
- Impressions and clicks
- Payout history and a **Withdraw** button once your balance clears the
  minimum payout threshold

Earnings reflect qualified ad views only (a minimum view duration is
required) and are not guaranteed -- they depend on advertiser demand and
your usage patterns.

## Uninstalling / disabling

- **DevAds: Disable** from the command palette, or toggle it off in the web
  dashboard -- either way, the change takes effect immediately and is
  enforced server-side, not just locally.
- Uninstall the extension like any other VS Code extension.
- Delete your account and data any time from the dashboard.
