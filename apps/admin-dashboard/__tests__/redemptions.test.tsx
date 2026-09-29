import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminRedemptionsView } from "../components/AdminRedemptionsView";
import {
  completeRedemption,
  failRedemption,
  fetchAdminRedemptions,
  isAdminRedemption,
  validateFailReason,
  validateFulfilmentRef,
  type AdminRedemption,
} from "../lib/redemptions";

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}

function row(overrides: Partial<AdminRedemption> = {}): AdminRedemption {
  return {
    id: "red_1",
    developerId: "dev_1",
    rewardType: "AI_CREDITS",
    amountUnits: 300,
    provider: "MANUAL",
    status: "PENDING",
    providerRef: null,
    failureReason: null,
    createdAt: "2026-09-28T10:15:00Z",
    completedAt: null,
    ...overrides,
  };
}

const actions = { filter: "PENDING" as const, onFilter: vi.fn(), onComplete: vi.fn(), onFail: vi.fn() };

describe("admin redemption API helpers", () => {
  it("loads a status-filtered queue and validates rows", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { redemptions: [row()] } });
    await expect(fetchAdminRedemptions("PENDING", get)).resolves.toEqual({ status: "ok", redemptions: [row()] });
    expect(get).toHaveBeenCalledWith("/api/v1/admin/redemptions?status=PENDING");
    await fetchAdminRedemptions(null, get);
    expect(get).toHaveBeenLastCalledWith("/api/v1/admin/redemptions");

    const bad = vi.fn().mockResolvedValue({ ok: true, status: 200, data: { redemptions: [{ ...row(), amountUnits: 2.5 }] } });
    expect((await fetchAdminRedemptions("PENDING", bad)).status).toBe("error");
    const forbidden = vi.fn().mockResolvedValue({ ok: false, status: 403, data: {} });
    expect(await fetchAdminRedemptions("PENDING", forbidden)).toEqual({ status: "unauthenticated" });
    expect(isAdminRedemption({ ...row(), status: "DONE" })).toBe(false);
  });

  it("posts complete and fail to the redemption's own routes", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, status: 200, data: {} });
    await completeRedemption("red/1", "ticket-9", post);
    expect(post).toHaveBeenCalledWith("/api/v1/admin/redemptions/red%2F1/complete", { providerRef: "ticket-9" });
    await completeRedemption("red_1", null, post);
    expect(post).toHaveBeenLastCalledWith("/api/v1/admin/redemptions/red_1/complete", {});
    await failRedemption("red_1", "sponsor out of codes", post);
    expect(post).toHaveBeenLastCalledWith("/api/v1/admin/redemptions/red_1/fail", { reason: "sponsor out of codes" });
  });

  it("explains an already-settled redemption", async () => {
    const post = vi.fn().mockResolvedValue({ ok: false, status: 409, data: { error: "redemption_not_open" } });
    await expect(completeRedemption("red_1", null, post)).resolves.toEqual({
      status: "error",
      message: "That redemption was already settled.",
    });
  });

  it("requires a fail reason and bounds both inputs", () => {
    expect(validateFailReason("  ")).toMatchObject({ ok: false });
    expect(validateFailReason(" out of codes ")).toEqual({ ok: true, reason: "out of codes" });
    expect(validateFailReason("x".repeat(201))).toMatchObject({ ok: false });
    expect(validateFulfilmentRef("")).toEqual({ ok: true, ref: null });
    expect(validateFulfilmentRef("x".repeat(201))).toMatchObject({ ok: false });
  });
});

describe("AdminRedemptionsView", () => {
  it("offers settle actions only on open redemptions", () => {
    const out = renderToStaticMarkup(
      <AdminRedemptionsView
        state={{
          status: "ok",
          redemptions: [
            row(),
            row({ id: "red_2", status: "COMPLETED", providerRef: "ticket-2", completedAt: "2026-09-28T11:00:00Z" }),
            row({ id: "red_3", status: "FAILED", failureReason: "sponsor out of codes" }),
          ],
        }}
        {...actions}
      />
    );
    expect(out.match(/Mark delivered/g)).toHaveLength(1);
    expect(out.match(/Fail and refund/g)).toHaveLength(1);
    expect(text(out)).toContain("2026-09-28 10:15 UTC dev_1 AI_CREDITS 300 MANUAL PENDING");
    expect(text(out)).toContain("ticket-2");
    expect(text(out)).toContain("sponsor out of codes");
  });

  it("renders the empty, error and expired-session states", () => {
    expect(text(renderToStaticMarkup(<AdminRedemptionsView state={{ status: "ok", redemptions: [] }} {...actions} />))).toContain(
      "No redemptions with this status"
    );
    expect(text(renderToStaticMarkup(<AdminRedemptionsView state={{ status: "error", message: "Boom" }} {...actions} />))).toContain("Boom");
    expect(text(renderToStaticMarkup(<AdminRedemptionsView state={{ status: "unauthenticated" }} {...actions} />))).toContain(
      "admin session has expired"
    );
  });
});
