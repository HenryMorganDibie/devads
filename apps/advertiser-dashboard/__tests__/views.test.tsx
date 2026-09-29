import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SponsorshipCampaignForm } from "../components/SponsorshipCampaignForm";
import { SponsorshipCampaignsView } from "../components/SponsorshipCampaignsView";
import { SponsorshipCampaignDetail, type CampaignDetailState } from "../components/SponsorshipCampaignDetail";
import { AdvertiserNav } from "../components/AdvertiserNav";
import { emptyCampaignForm, emptyOfferForm } from "../lib/sponsorships";
import { campaign, offer, text } from "./fixtures";

/** The opening tag of the form control with the given name attribute. */
function controlTag(html: string, name: string): string {
  const m = new RegExp(`<(input|textarea|select)[^>]*name="${name}"[^>]*>`).exec(html);
  if (!m) throw new Error(`no control named ${name}`);
  return m[0];
}

function renderForm(errors: Record<string, string> = {}, submitError: string | null = null) {
  return renderToStaticMarkup(
    <SponsorshipCampaignForm
      values={emptyCampaignForm()}
      errors={errors}
      submitting={false}
      submitError={submitError}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  );
}

describe("SponsorshipCampaignForm", () => {
  it("renders the sponsor category as optional, never required", () => {
    const html = renderForm();
    expect(text(html)).toContain("Sponsor category (optional)");
    expect(controlTag(html, "sponsorCategory")).not.toContain("required");
  });

  it("marks only the schema's required fields as required", () => {
    const html = renderForm();
    for (const name of ["name", "rewardAmountUnits", "sponsorCharge"]) {
      expect(controlTag(html, name)).toContain("required");
    }
    for (const name of [
      "totalBudget",
      "dailyBudget",
      "developerDailyCap",
      "developerLifetimeCap",
      "frequencyCapPerDay",
      "startDate",
      "endDate",
      "offerTitle",
      "offerRequiredAction",
    ]) {
      expect(controlTag(html, name)).not.toContain("required");
    }
  });

  it("offers every server enum and no invented fields", () => {
    const html = renderForm();
    for (const v of ["AWARENESS", "TRIAL_ACTIVATION", "AI_CREDITS", "SUBSCRIPTION_CREDIT", "VS_CODE", "LOCAL_AGENT"]) {
      expect(html).toContain(`value="${v}"`);
    }
    const names = new Set([...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
    expect([...names].sort()).toEqual(
      [
        "dailyBudget",
        "developerDailyCap",
        "developerLifetimeCap",
        "eligibleClientTypes",
        "endDate",
        "frequencyCapPerDay",
        "name",
        "objective",
        "offerCtaUrl",
        "offerDescription",
        "offerExpiresAt",
        "offerRequiredAction",
        "offerTitle",
        "rewardAmountUnits",
        "rewardType",
        "sponsorCategory",
        "sponsorCharge",
        "startDate",
        "totalBudget",
      ].sort()
    );
  });

  it("labels it as a Sponsorship / Developer Reward, not an ad campaign", () => {
    const out = text(renderForm());
    expect(out).toContain("Developer Reward");
    expect(out).not.toMatch(/\bCPM\b|impression/i);
  });

  it("shows field and submit errors", () => {
    const out = text(renderForm({ name: "Enter a campaign name.", "offer.ctaUrl": "Enter a full link" }, "Fix the highlighted fields"));
    expect(out).toContain("Enter a campaign name.");
    expect(out).toContain("Enter a full link");
    expect(out).toContain("Fix the highlighted fields");
  });
});

describe("SponsorshipCampaignsView", () => {
  it("renders loading", () => {
    expect(text(renderToStaticMarkup(<SponsorshipCampaignsView state={{ status: "loading" }} />))).toContain(
      "Loading your sponsorship campaigns"
    );
  });

  it("renders an empty state with a create link", () => {
    const html = renderToStaticMarkup(<SponsorshipCampaignsView state={{ status: "ok", campaigns: [] }} />);
    expect(text(html)).toContain("No sponsorship campaigns yet.");
    expect(html).toContain('href="/sponsorships/new"');
  });

  it("renders the error state with retry", () => {
    const html = renderToStaticMarkup(
      <SponsorshipCampaignsView state={{ status: "error", message: "Boom." }} onRetry={vi.fn()} />
    );
    expect(text(html)).toContain("Boom.");
    expect(html).toContain("Try again");
    expect(html).toContain('role="alert"');
  });

  it("asks an expired session to sign in", () => {
    const html = renderToStaticMarkup(<SponsorshipCampaignsView state={{ status: "unauthenticated" }} />);
    expect(html).toContain('href="/login"');
  });

  it("lists every status with integer-formatted stats and a submit action only for ready drafts", () => {
    const campaigns = [
      campaign({ id: "a", status: "DRAFT", offers: [offer] }),
      campaign({ id: "b", status: "DRAFT", offers: [] }),
      campaign({ id: "c", status: "SUBMITTED", offers: [offer] }),
      campaign({
        id: "d",
        status: "APPROVED",
        offers: [offer],
        stats: { displays: 12345, completions: 7, rewardsGranted: 7, spendCents: 1750 },
      }),
      campaign({ id: "e", status: "REJECTED" }),
      campaign({ id: "f", status: "PAUSED" }),
      campaign({ id: "g", status: "ARCHIVED" }),
    ];
    const html = renderToStaticMarkup(<SponsorshipCampaignsView state={{ status: "ok", campaigns }} />);
    for (const s of ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAUSED", "ARCHIVED"]) {
      expect(html).toContain(`data-status="${s}"`);
    }
    const out = text(html);
    expect(out).toContain("12,345");
    expect(out).toContain("$17.50");
    expect(out).toContain("500 AI Credits");
    expect(out).toContain("$2.50 per completion");
    expect(out.match(/Submit for review/g)).toHaveLength(1);
    expect(out).toContain("Add an offer to submit");
  });

  it("shows an action error", () => {
    const out = text(
      renderToStaticMarkup(<SponsorshipCampaignsView state={{ status: "ok", campaigns: [] }} actionError="Nope." />)
    );
    expect(out).toContain("Nope.");
  });
});

function renderDetail(state: CampaignDetailState) {
  return renderToStaticMarkup(
    <SponsorshipCampaignDetail
      state={state}
      offerForm={emptyOfferForm()}
      offerErrors={{}}
      offerSubmitting={false}
      onOfferChange={vi.fn()}
      onAddOffer={vi.fn()}
      submitting={false}
      onSubmitCampaign={vi.fn()}
    />
  );
}

describe("SponsorshipCampaignDetail", () => {
  it("renders loading, not found, error and expired-session states", () => {
    expect(text(renderDetail({ status: "loading" }))).toContain("Loading the sponsorship campaign");
    expect(text(renderDetail({ status: "not_found" }))).toContain("wasn't found");
    expect(text(renderDetail({ status: "error", message: "Down." }))).toContain("Down.");
    expect(renderDetail({ status: "unauthenticated" })).toContain('href="/login"');
  });

  it("shows a missing sponsor category as not specified", () => {
    const out = text(renderDetail({ status: "ok", campaign: campaign() }));
    expect(out).toContain("Sponsor category Not specified");
  });

  it("lets a draft add offers; the submit button is disabled until it has one", () => {
    const empty = renderDetail({ status: "ok", campaign: campaign() });
    expect(text(empty)).toContain("Add an offer");
    expect(text(empty)).toContain("Add at least one offer first.");
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Submit for review/);

    const ready = renderDetail({ status: "ok", campaign: campaign({ offers: [offer] }) });
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit for review/);
    expect(controlTag(ready, "offerTitle")).toContain("required");
  });

  it("locks offers after submission and explains the missing edit capability", () => {
    const html = renderDetail({ status: "ok", campaign: campaign({ status: "APPROVED", offers: [offer] }) });
    const out = text(html);
    expect(html).not.toContain('name="offerTitle"');
    expect(out).not.toContain("Submit for review");
    expect(out).toContain("Offers can only be added while the campaign is a draft");
  });

  it("reconciles spend with integer money and flags unbilled completions", () => {
    const out = text(
      renderDetail({
        status: "ok",
        campaign: campaign({
          status: "APPROVED",
          offers: [offer],
          totalBudgetCents: 1000,
          stats: { displays: 40, completions: 6, rewardsGranted: 5, spendCents: 1000 },
        }),
      })
    );
    expect(out).toContain("5 x $2.50 = $12.50");
    expect(out).toContain("Total budget remaining $0.00");
    expect(out).toContain("$2.50 of rewarded completions weren't charged");
  });

  it("shows the rejection reason", () => {
    const out = text(
      renderDetail({ status: "ok", campaign: campaign({ status: "REJECTED", rejectionReason: "Link is broken" }) })
    );
    expect(out).toContain("Rejected: Link is broken");
  });
});

describe("AdvertiserNav", () => {
  it("separates Ad Campaigns from Sponsorships", () => {
    const html = renderToStaticMarkup(<AdvertiserNav current="sponsorships" />);
    expect(html).toContain('href="/campaigns"');
    expect(text(html)).toContain("Ad Campaigns");
    expect(html).toMatch(/aria-current="page"[^>]*>Sponsorships/);
  });
});
