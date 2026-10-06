# Advertiser Guide

> This guide covers wait-time sponsored cards: CPM campaigns shown in VS Code
> during builds, installs and tests, the first format on DevAds. Sponsorship
> campaigns, which charge per verified completion and give the developer a
> reward (AI, API or compute credits, discounts, event access and more), are
> created from the **Sponsorships** page of the same dashboard. See
> [sponsorship-architecture.md](./sponsorship-architecture.md) for how they
> are selected, verified, charged and rewarded.

## Audience

Developers who've opted in to DevAds, reached during natural wait time in
their own editor -- not a webpage, not a video pre-roll. Campaigns can
target by language, framework, runtime, platform, and country.

## Creating a campaign

1. Create an advertiser account at the [advertiser dashboard](http://localhost:3001/signup).
2. **New campaign**: set a name, CPM (cost per 1,000 impressions), optional
   daily/total budget, and targeting (languages, frameworks, countries --
   leave any field blank to match everything).
3. Add a creative: headline, optional body copy, CTA label, destination
   URL, and (optional) an image -- PNG/JPEG/WebP/GIF up to 5MB. Uploaded
   images are validated server-side (MIME type + size, never trusted from
   the browser) and stored in object storage; the dashboard shows a live
   preview before you submit. Video upload isn't wired into the UI for
   CPM campaigns (the VIDEO creative type and its storage path exist end to
   end, but the standard card is a text-only status bar item -- see
   [architecture.md](./architecture.md#roadmap)). Video is available for
   sponsorship offers, presented in the extension's DevAds panel; see
   [beta-video-ads.md](./beta-video-ads.md).
4. Submit. Your campaign moves to **Submitted** and enters the admin review
   queue.

## Campaign lifecycle

```
Draft -> Submitted -> Approved -> (serving) -> Paused / Completed
                    -> Rejected (with a reason)
```

An admin reviews every campaign and its destination URL before it can
serve. Approved campaigns start serving immediately, subject to targeting,
budget, and developer frequency caps. Admins can pause a live campaign or
suspend an advertiser account at any time (e.g. for a flagged destination
URL).

## Pricing

CPM (cost per 1,000 impressions), USD in this MVP. Set your own CPM when
creating a campaign; the platform ranks eligible campaigns by CPM among
those that match a given ad request. Budgets (daily and/or total) stop
delivery automatically once reached -- no overspend.

## Reporting

Your dashboard shows, per campaign: impressions, clicks, CTR, and spend,
refreshed from the same ledger the platform uses for billing (not a
separate, client-reported number).

## What we review

- Destination URL (no malicious/deceptive content)
- Creative copy (no misleading claims)
- Company legitimacy for new advertiser accounts

We reserve the right to reject or pause any campaign that doesn't meet
these bars, and to suspend accounts for repeated violations.
