import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@devads/database";
import { signSession, verifySession } from "@devads/auth";
import { buildApp } from "../app.js";

/**
 * Device sign-in (the VS Code extension's login). Regression coverage for an
 * account-takeover bug: /device/approve used to be unauthenticated and trust
 * a userId from the body, so anyone could start a device flow, approve it as
 * any user, and collect that user's session token from /device/poll.
 */

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-please-32chars";

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = true;

const victimUser = "test-device-victim";
const victimDev = "test-device-victim-dev";
const attackerUser = "test-device-attacker";

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

beforeEach(async () => {
  if (!dbAvailable) return;
  for (const [id, role] of [
    [victimUser, "ADMIN"],
    [attackerUser, "DEVELOPER"],
  ] as const) {
    await prisma.user.upsert({ where: { id }, update: { role }, create: { id, email: `${id}@example.com`, role } });
  }
  await prisma.developerProfile.upsert({ where: { id: victimDev }, update: {}, create: { id: victimDev, userId: victimUser } });
});

async function startFlow() {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/device/start", payload: {} });
  expect(res.statusCode).toBe(200);
  return res.json() as { deviceCode: string; userCode: string };
}

async function poll(deviceCode: string) {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/device/poll", payload: { deviceCode } });
  return res.json() as { status: string; token: string | null; developerId?: string | null };
}

const bearer = (sub: string, role: "DEVELOPER" | "ADMIN" = "DEVELOPER") => ({
  authorization: `Bearer ${signSession({ sub, role }, SESSION_SECRET)}`,
});

describe("device sign-in approval", () => {
  it("refuses an unauthenticated approval, so no token is ever issued for the named user", async () => {
    if (!dbAvailable) return;
    const { deviceCode, userCode } = await startFlow();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/device/approve",
      payload: { userCode, userId: victimUser },
    });
    expect(res.statusCode).toBe(401);
    expect(await poll(deviceCode)).toMatchObject({ status: "pending", token: null });
  });

  it("binds the device to the signed-in user and ignores a userId in the body", async () => {
    if (!dbAvailable) return;
    const { deviceCode, userCode } = await startFlow();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/device/approve",
      headers: bearer(attackerUser),
      payload: { userCode, userId: victimUser },
    });
    expect(res.statusCode).toBe(200);

    const result = await poll(deviceCode);
    expect(result.status).toBe("approved");
    const session = verifySession(result.token!, SESSION_SECRET);
    expect(session?.sub).toBe(attackerUser);
    expect(session?.role).toBe("DEVELOPER");
  });

  it("signs the approving developer in on the device (the legitimate flow)", async () => {
    if (!dbAvailable) return;
    const { deviceCode, userCode } = await startFlow();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/device/approve",
      headers: bearer(victimUser, "ADMIN"),
      payload: { userCode },
    });
    expect(res.statusCode).toBe(200);

    const result = await poll(deviceCode);
    expect(result).toMatchObject({ status: "approved", developerId: victimDev });
    expect(verifySession(result.token!, SESSION_SECRET)?.sub).toBe(victimUser);
  });

  it("a code can only be approved once", async () => {
    if (!dbAvailable) return;
    const { userCode } = await startFlow();
    const first = await app.inject({ method: "POST", url: "/api/v1/auth/device/approve", headers: bearer(victimUser, "ADMIN"), payload: { userCode } });
    const second = await app.inject({ method: "POST", url: "/api/v1/auth/device/approve", headers: bearer(attackerUser), payload: { userCode } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.json()).toEqual({ error: "invalid_or_expired_code" });
  });
});

describe("public signup", () => {
  it("cannot create an administrator (regression: role ADMIN used to be accepted and returned an ADMIN session)", async () => {
    if (!dbAvailable) return;
    const email = `test-signup-escalation-${Date.now()}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: { email, password: "longenough-password", role: "ADMIN" },
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    const overview = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: bearer("some-self-registered-user", "DEVELOPER"),
    });
    expect(overview.statusCode).toBe(403);
  });

  it("still signs developers up", async () => {
    if (!dbAvailable) return;
    const email = `test-signup-dev-${Date.now()}@example.com`;
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email, password: "longenough-password" } });
    expect(res.statusCode).toBe(200);
    expect(verifySession(res.json().token, SESSION_SECRET)?.role).toBe("DEVELOPER");
    await prisma.user.delete({ where: { email } });
  });
});
