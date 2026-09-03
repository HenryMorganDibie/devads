import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@devads/database";
import { signSession } from "@devads/auth";
import { buildApp } from "../app.js";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
    return;
  }
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

const ownerUserId = "test-authguard-owner";
const otherUserId = "test-authguard-other";
const devId = "test-authguard-developer";

beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.user.upsert({
    where: { id: ownerUserId },
    update: {},
    create: { id: ownerUserId, email: `${ownerUserId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.user.upsert({
    where: { id: otherUserId },
    update: {},
    create: { id: otherUserId, email: `${otherUserId}@example.com`, role: "DEVELOPER" },
  });
  await prisma.developerProfile.upsert({
    where: { id: devId },
    update: {},
    create: { id: devId, userId: ownerUserId },
  });
});

function tokenFor(userId: string) {
  return signSession({ sub: userId, role: "DEVELOPER" }, SESSION_SECRET);
}

describe("auth guard", () => {
  it("rejects a preferences request with no session token", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({ method: "GET", url: `/api/v1/developers/${devId}/preferences` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a preferences request from a signed-in user who doesn't own the profile", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/developers/${devId}/preferences`,
      headers: { authorization: `Bearer ${tokenFor(otherUserId)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows the owning user to read their own preferences", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/developers/${devId}/preferences`,
      headers: { authorization: `Bearer ${tokenFor(ownerUserId)}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects admin overview without an ADMIN-role session", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${tokenFor(ownerUserId)}` }, // DEVELOPER role, not ADMIN
    });
    expect(res.statusCode).toBe(403);
  });

  it("still allows unauthenticated ad selection (extension flow, no gap introduced)", async () => {
    if (!dbAvailable) return;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/ads/select",
      payload: { context: { developerId: devId, command: "npm", elapsedSeconds: 30 } },
    });
    expect(res.statusCode).toBe(200);
  });
});
