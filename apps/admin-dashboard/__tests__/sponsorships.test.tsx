import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSponsorshipsView } from "../components/AdminSponsorshipsView";
import { SponsorshipActivityView } from "../components/SponsorshipActivityView";
import {
  approveSponsorshipCampaign,
  fetchAdminSponsorshipCampaigns,
  fetchSponsorshipEvents,
  fetchSponsorshipRewards,
  formatDateTime,
  isAdminRewardLedgerEntry,
  isAdminSponsorshipEvent,
  type AdminRewardLedgerEntry,
  type AdminSponsorshipEvent,
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

  it("points to per-campaign activity instead of the old 'not available' gap", () => {
    const out = text(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "ok", campaigns: [] }} />));
    expect(out).toContain("Choose Activity on a sponsorship campaign");
    expect(out).not.toContain("There is no admin read endpoint");
  });

  it("shows the advertiser name next to the id, and the campaign stats", () => {
    const html = renderToStaticMarkup(
      <AdminSponsorshipsView
        state={{
          status: "ok",
          campaigns: [
            campaign({ advertiserName: "Acme Tools", stats: { displays: 12345, completions: 67, rewardsGranted: 60, spendCents: 19500 } }),
            campaign({ id: "live", status: "APPROVED", advertiserName: "Beta Labs", stats: { displays: 3, completions: 1, rewardsGranted: 1, spendCents: 325 } }),
          ],
        }}
      />
    );
    const out = text(html);
    expect(out).toContain("Advertiser Acme Tools adv1");
    expect(out).toContain("So far: 12,345 displays, 67 completions, 60 rewards granted, $195.00 spent");
    expect(out).toContain("Beta Labs adv1");
    expect(out).toContain("3 / 1 / $3.25");
  });

  it("still renders a campaign without the additive fields (id only, stats not available)", () => {
    const out = text(renderToStaticMarkup(<AdminSponsorshipsView state={{ status: "ok", campaigns: [campaign({ status: "PAUSED" })] }} />));
    expect(out).toContain("adv1");
    expect(out).toContain("not available");
  });

  it("offers an Activity button per campaign and renders the given activity panel", () => {
    const html = renderToStaticMarkup(
      <AdminSponsorshipsView
        state={{ status: "ok", campaigns: [campaign(), campaign({ id: "a", status: "APPROVED" })] }}
        onViewActivity={vi.fn()}
        activityCampaignId="a"
        activityPanel={<p>PANEL</p>}
      />
    );
    expect(html.match(/>Activity</g)).toHaveLength(2);
    expect(html).toMatch(/disabled="">Activity</);
    expect(text(html)).toContain("PANEL");
    expect(text(html)).not.toContain("Choose Activity on a sponsorship campaign");
  });
});

function event(overrides: Partial<AdminSponsorshipEvent> = {}): AdminSponsorshipEvent {
  return {
    eventId: "evt-complete-1",
    type: "OFFER_COMPLETED",
    offerId: "o1",
    developerId: "dev-1",
    sessionId: "sess-1",
    displayEventId: "evt-display-1",
    createdAt: "2026-09-29T12:00:05.123Z",
    ...overrides,
  };
}

function reward(overrides: Partial<AdminRewardLedgerEntry> = {}): AdminRewardLedgerEntry {
  return {
    id: "led-1",
    developerId: "dev-1",
    rewardType: "API_CREDITS",
    campaignId: "sc1",
    sponsorshipEventId: "evt-display-1",
    entryType: "EARNED",
    amountUnits: 1500,
    status: "APPROVED",
    createdAt: "2026-09-29T12:00:05.200Z",
    ...overrides,
  };
}

describe("additive admin list fields", () => {
  it("accepts the enriched list response and validates the new fields when present", () => {
    const stats = { displays: 3, completions: 1, rewardsGranted: 1, spendCents: 325 };
    expect(isAdminSponsorshipCampaign({ ...campaign(), advertiserName: "Acme", stats })).toBe(true);
    expect(isAdminSponsorshipCampaign(campaign())).toBe(true); // older server: still parses
    expect(isAdminSponsorshipCampaign({ ...campaign(), stats: { ...stats, spendCents: 1.5 } })).toBe(false);
    expect(isAdminSponsorshipCampaign({ ...campaign(), stats: { displays: 1 } })).toBe(false);
    expect(isAdminSponsorshipCampaign({ ...campaign(), advertiserName: 7 })).toBe(false);
  });

  it("loads the enriched list through the unchanged loader", async () => {
    const enriched = { ...campaign(), advertiserName: "Acme", stats: { displays: 3, completions: 1, rewardsGranted: 1, spendCents: 325 } };
    expect(await fetchAdminSponsorshipCampaigns(res(true, 200, [enriched]))).toEqual({ status: "ok", campaigns: [enriched] });
  });
});

describe("sponsorship activity loaders", () => {
  it("requests a page of events or rewards with the page size and the cursor", async () => {
    const get = res(true, 200, { items: [event()], nextCursor: "c2" });
    expect(await fetchSponsorshipEvents("sc 1", null, get)).toEqual({ status: "ok", page: { items: [event()], nextCursor: "c2" } });
    await fetchSponsorshipEvents("sc1", "c2", get);
    const rewardsGet = res(true, 200, { items: [reward()], nextCursor: null });
    expect(await fetchSponsorshipRewards("sc1", "abc=", rewardsGet)).toEqual({ status: "ok", page: { items: [reward()], nextCursor: null } });
    const calls = (get as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "/api/v1/admin/sponsorship-campaigns/sc%201/events?limit=50",
      "/api/v1/admin/sponsorship-campaigns/sc1/events?limit=50&cursor=c2",
    ]);
    const rewardCalls = (rewardsGet as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(rewardCalls).toEqual(["/api/v1/admin/sponsorship-campaigns/sc1/rewards?limit=50&cursor=abc%3D"]);
  });

  it("maps 403 to unauthenticated, 404 and bad bodies to errors, and never throws", async () => {
    expect((await fetchSponsorshipEvents("sc1", null, res(false, 403))).status).toBe("unauthenticated");
    expect(await fetchSponsorshipRewards("sc1", null, res(false, 404))).toEqual({
      status: "error",
      message: "That sponsorship campaign no longer exists.",
    });
    expect((await fetchSponsorshipEvents("sc1", null, res(false, 500))).status).toBe("error");
    expect((await fetchSponsorshipEvents("sc1", null, res(true, 200, { items: [{ eventId: 1 }], nextCursor: null }))).status).toBe("error");
    expect((await fetchSponsorshipRewards("sc1", null, res(true, 200, { items: [] }))).status).toBe("error");
    const offline = vi.fn(async () => {
      throw new Error("offline");
    }) as never;
    expect((await fetchSponsorshipRewards("sc1", null, offline)).status).toBe("error");
  });

  it("checks row shapes (known enums, integer units)", () => {
    expect(isAdminSponsorshipEvent(event())).toBe(true);
    expect(isAdminSponsorshipEvent(event({ type: "OFFER_BOUGHT" as never }))).toBe(false);
    expect(isAdminRewardLedgerEntry(reward())).toBe(true);
    expect(isAdminRewardLedgerEntry(reward({ amountUnits: 1.5 }))).toBe(false);
    expect(isAdminRewardLedgerEntry(reward({ entryType: "GIFT" as never }))).toBe(false);
  });

  it("formats activity times to the second in UTC", () => {
    expect(formatDateTime("2026-09-29T12:00:05.123Z")).toBe("2026-09-29 12:00:05");
    expect(formatDateTime("nope")).toBe("Unknown time");
  });
});

describe("SponsorshipActivityView", () => {
  const c = { id: "sc1", name: "Launch credits", advertiserId: "adv1", advertiserName: "Acme Tools" };
  const paging = (pageNumber = 1) => ({ pageNumber, onNewer: vi.fn(), onOlder: vi.fn(), onRetry: vi.fn() });

  it("renders the events and reward ledger tables with correlation ids", () => {
    const html = renderToStaticMarkup(
      <SponsorshipActivityView
        campaign={c}
        events={{ status: "ok", page: { items: [event(), event({ eventId: "evt-display-1", type: "OFFER_DISPLAYED", displayEventId: null, sessionId: null })], nextCursor: "next" } }}
        rewards={{ status: "ok", page: { items: [reward()], nextCursor: null } }}
        eventsPaging={paging()}
        rewardsPaging={paging()}
      />
    );
    const out = text(html);
    expect(out).toContain("Activity: Launch credits");
    expect(out).toContain("Acme Tools adv1");
    expect(out).toContain("2026-09-29 12:00:05 Completed dev-1 sess-1 evt-complete-1 evt-display-1 o1");
    expect(out).toContain("Displayed dev-1 none evt-display-1 none o1");
    expect(out).toContain("dev-1 EARNED 1,500 API Credits APPROVED evt-display-1");
    // Events: first page with more -> Newer disabled, Older enabled. Rewards: single page -> both disabled.
    expect(html.match(/disabled="">Newer</g)).toHaveLength(2);
    expect(html.match(/disabled="">Older</g)).toHaveLength(1);
    expect(html.match(/>Older</g)).toHaveLength(2);
  });

  it("enables Newer after the first page", () => {
    const html = renderToStaticMarkup(
      <SponsorshipActivityView
        campaign={c}
        events={{ status: "ok", page: { items: [event()], nextCursor: null } }}
        rewards={{ status: "ok", page: { items: [], nextCursor: null } }}
        eventsPaging={paging(2)}
        rewardsPaging={paging()}
      />
    );
    expect(text(html)).toContain("Page 2");
    expect(html).not.toMatch(/disabled="">Newer</);
    expect(text(html)).toContain("No developer rewards recorded for this campaign.");
  });

  it("renders loading, error, expired-session and empty states per table", () => {
    const html = renderToStaticMarkup(
      <SponsorshipActivityView
        campaign={c}
        events={{ status: "loading" }}
        rewards={{ status: "error", message: "Ledger down." }}
        eventsPaging={paging()}
        rewardsPaging={paging()}
      />
    );
    expect(text(html)).toContain("Loading sponsorship events");
    expect(text(html)).toContain("Ledger down.");
    expect(html).toContain("Try again");

    const expired = renderToStaticMarkup(
      <SponsorshipActivityView
        campaign={c}
        events={{ status: "unauthenticated" }}
        rewards={{ status: "ok", page: { items: [], nextCursor: null } }}
        eventsPaging={paging()}
        rewardsPaging={paging()}
      />
    );
    expect(expired).toContain('href="/login"');
    expect(text(expired)).toContain("No developer rewards recorded for this campaign.");
  });
});

