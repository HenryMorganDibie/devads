# Advertiser Guide

## Audience

Developers who've opted in to DevAds, reached during natural wait time in
their own editor -- not a webpage, not a video pre-roll. Campaigns can
target by language, framework, runtime, platform, and country.

## Creating a campaign

1. Create an advertiser account at the [advertiser dashboard](http://localhost:3001/signup).
2. **New campaign**: set a name, CPM (cost per 1,000 impressions), optional
   daily/total budget, and targeting (languages, frameworks, countries --
   leave any field blank to match everything).
3. Add a creative: headline, optional body copy, CTA label, and destination
   URL. (Image/video upload to object storage is not wired into the UI yet
   in this MVP -- see [architecture.md](./architecture.md#roadmap) --
   creatives currently ship with headline/body/CTA only.)
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
