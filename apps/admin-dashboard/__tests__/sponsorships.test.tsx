import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSponsorshipsView } from "../components/AdminSponsorshipsView";
import {
  approveSponsorshipCampaign,
  fetchAdminSponsorshipCampaigns,
  formatMoneyCents,
  isAdminSponsorshipCampaign,
  pauseSponsorshipCampaign,
  rejectSponsorshipCampaign,
  splitReviewQueue,
  validateRejectReason,
  type AdminSponsorshipCampaign,
} from "../lib/sponsorships";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function campaign(overrides: Partial<AdminSponsorshipCampaign> = {}): AdminSponsorshipCampaign {
  return {
    id: "sc1",
    advertiserId: "adv1",
    name: "Launch credits",
    sponsorCategory: null,
    objective: "TRIAL_ACTIVATION",
    rewardType: "API_CREDITS",
    rewardAmountUnits: 1500,
    sponsorChargeCents: 325,
    currency: "USD",
    totalBudgetCents: 500000,
    dailyBudgetCents: null,
    developerDailyCap: 1,
    developerLifetimeCap: 3,
    frequencyCapPerDay: null,
    eligibleClientTypes: ["VS_CODE"],
    startDate: "2026-10-01T00:00:00.000Z",
    endDate: null,
    status: "SUBMITTED",
    rejectionReason: null,
    submittedAt: "2026-09-29T10:00:00.000Z",
    approvedAt: null,
    createdAt: "2026-09-29T09:00:00.000Z",
    offers: [
      {
        id: "o1",
        title: "Deploy a function",
        description: "Ship one serverless function",
        ctaUrl: "https://example.com/start",
        requiredAction: "Deploy a function",
        expiresAt: null,
        status: "ACTIVE",
      },
    ],
    ...overrides,
  };
}

function res(ok: boolean, status: number, data: unknown = {}) {
  return vi.fn(async () => ({ ok, status, data })) as never;
}

describe("admin sponsorship helpers", () => {
  it("formats cents from digits", () => {
    expect(formatMoneyCents(325)).toBe("$3.25");
    expect(formatMoneyCents(500000)).toBe("$5,000.00");
  });

  it("splits the SUBMITTED queue (oldest submission first) from everything else", () => {
    const { queue, others } = splitReviewQueue([
      campaign({ id: "new", submittedAt: "2026-09-29T12:00:00.000Z" }),
      campaign({ id: "live", status: "APPROVED" }),
      campaign({ id: "old", submittedAt: "2026-09-28T12:00:00.000Z" }),
    ]);
    expect(queue.map((c) => c.id)).toEqual(["old", "new"]);
    expect(others.map((c) => c.id)).toEqual(["live"]);
  });

  it("validates the rejection reason like the server (1-500 chars)", () => {
    expect(validateRejectReason("  ")).toEqual({ ok: false, message: expect.any(String) });
    expect(validateRejectReason(null).ok).toBe(false);
    expect(validateRejectReason("x".repeat(501)).ok).toBe(false);
    expect(validateRejectReason(" Broken link ")).toEqual({ ok: true, reason: "Broken link" });
  });

  it("checks the response shape", () => {
    expect(isAdminSponsorshipCampaign(campaign())).toBe(true);
    expect(isAdminSponsorshipCampaign(campaign({ rewardAmountUnits: 1.5 }))).toBe(false);
    expect(isAdminSponsorshipCampaign({ ...campaign(), status: "LIVE" })).toBe(false);
  });
});

describe("admin sponsorship loaders and actions", () => {
  it("loads all sponsorship campaigns from the admin route", async () => {
    const get = res(true, 200, [campaign()]);
    expect(await fetchAdminSponsorshipCampaigns(get)).toEqual({ status: "ok", campaigns: [campaign()] });
    expect(get).toHaveBeenCalledWith("/api/v1/admin/sponsorship-campaigns");
  });

  it("maps 403 (requireAdmin) to unauthenticated, and failures to errors", async () => {
    expect((await fetchAdminSponsorshipCampaigns(res(false, 403))).status).toBe("unauthenticated");
    expect((await fetchAdminSponsorshipCampaigns(res(false, 500))).status).toBe("error");
    expect((await fetchAdminSponsorshipCampaigns(res(true, 200, [{ id: 1 }]))).status).toBe("error");
    const offline = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect((await fetchAdminSponsorshipCampaigns(offline)).status).toBe("error");
  });

  it("uses the existing approve / reject / pause routes", async () => {
    const post = res(true, 200, campaign());
    await approveSponsorshipCampaign("sc1", post);
    await rejectSponsorshipCampaign("sc1", "Broken link", post);
    await pauseSponsorshipCampaign("sc1", post);
    const calls = (post as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toEqual([
      ["/api/v1/admin/sponsorship-campaigns/sc1/approve", {}],
      ["/api/v1/admin/sponsorship-campaigns/sc1/reject", { reason: "Broken link" }],
      ["/api/v1/admin/sponsorship-campaigns/sc1/pause", {}],
    ]);
  });

  it("explains state conflicts", async () => {
    expect(await approveSponsorshipCampaign("sc1", res(false, 409, { error: "campaign_not_submitted" }))).toEqual({
      status: "error",
      message: "That sponsorship campaign is no longer waiting for review.",
    });
  });
});

describe("AdminSponsorshipsView", () => {
  it("renders loading, error and expired-session states", () => {
    expect(text(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "loading" }} />))).toContain(
      "Loading sponsorship campaigns"
    );
    const err = renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "error", message: "Down." }} onRetry={vi.fn()} />);
    expect(text(err)).toContain("Down.");
    expect(err).toContain("Try again");
    expect(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "unauthenticated" }} />)).toContain('href="/login"');
  });

  it("renders empty queue and empty list honestly", () => {
    const out = text(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "ok", campaigns: [] }} />));
    expect(out).toContain("No sponsorship campaigns waiting on review.");
    expect(out).toContain("No other sponsorship campaigns.");
  });

  it("shows the queue with everything a reviewer needs, and a missing category as not specified", () => {
    const html = renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "ok", campaigns: [campaign()] }} />);
    const out = text(html);
    expect(out).toContain("Sponsorships pending review 1");
    expect(out).toContain("category: not specified");
    expect(out).toContain("1,500 API Credits per completion");
    expect(out).toContain("$3.25 per rewarded completion");
    expect(out).toContain("total $5,000.00");
    expect(out).toContain("Deploy a function");
    expect(out).toContain("https://example.com/start");
    expect(out).toContain("Tools: VS Code");
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Reject<");
  });

  it("offers pause only for approved campaigns", () => {
    const html = renderToStaticMarkup(
      <AdminSponsorshipsView
        state={{
          status: "ok",
          campaigns: [
            campaign({ id: "a", status: "APPROVED" }),
            campaign({ id: "p", status: "PAUSED" }),
            campaign({ id: "r", status: "REJECTED", rejectionReason: "Misleading" }),
          ],
        }}
      />
    );
    expect(html.match(/>Pause</g)).toHaveLength(1);
    expect(text(html)).toContain("Rejected: Misleading");
  });

  it("states that sponsorship activity inspection has no read endpoint yet", () => {
    const out = text(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "ok", campaigns: [] }} />));
    expect(out).toContain("There is no admin read endpoint for sponsorship events or the developer reward ledger");
  });
});
