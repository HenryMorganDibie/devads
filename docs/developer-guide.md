# Developer Guide

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
