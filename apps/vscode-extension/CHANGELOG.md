# Changelog

## Unreleased

Sponsored offers with developer rewards via the DevAds Protocol SDK
(`@devads/ad-sdk`): a development session while signed in, a separate
"Sponsored" status bar item during waits with View offer / Skip, and
**DevAds: Show Reward Wallet**. Gated by `devads.sponsorship.enabled`. The
existing sponsored-card flow is unchanged.

Beta fixes: the extension now defaults to the production API and site
(`https://devads-api.vercel.app`, `https://devads-app.vercel.app`); sign-in
polls immediately instead of waiting for the pairing toast to be clicked; and
opening a DevAds beta offer passes its display id to the walkthrough so the
offer can be completed and rewarded.

## 0.1.0

Initial MVP: terminal command detection via shell integration, status-bar
sponsored cards, device-pairing sign-in, per-developer preferences, offline
degradation.
