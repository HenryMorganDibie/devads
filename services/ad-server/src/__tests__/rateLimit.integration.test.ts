import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@devads/database";
import { buildApp } from "../app.js";

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

describe("rate limiting", () => {
  it("rejects login attempts past the per-route limit (brute-force protection)", async () => {
    if (!dbAvailable) return;

    // The login route's limit is 10/minute -- fire 12 in a row and expect
    // at least one 429 once the limit is exceeded.
    const results = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nonexistent-ratelimit-test@example.com", password: "wrong" },
      });
      results.push(res.statusCode);
    }

    expect(results).toContain(429);
    // The earliest requests should have been processed normally (401 for
    // bad credentials), proving this isn't blocking legitimate traffic.
    expect(results.slice(0, 5)).toContain(401);
  });
});
