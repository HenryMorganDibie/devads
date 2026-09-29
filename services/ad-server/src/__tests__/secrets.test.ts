import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEV_SESSION_SECRET, isProductionEnv, resolveSessionSecret } from "../lib/secrets.js";

const STRONG = "k3y-" + "x".repeat(40);

describe("resolveSessionSecret", () => {
  it("uses the configured secret in any environment", () => {
    expect(resolveSessionSecret({ SESSION_SECRET: STRONG })).toBe(STRONG);
    expect(resolveSessionSecret({ SESSION_SECRET: STRONG, NODE_ENV: "production" })).toBe(STRONG);
  });

  it("keeps the development default outside production so local setup is unchanged", () => {
    expect(resolveSessionSecret({})).toBe(DEV_SESSION_SECRET);
    expect(resolveSessionSecret({ NODE_ENV: "development", SESSION_SECRET: "  " })).toBe(DEV_SESSION_SECRET);
    expect(resolveSessionSecret({ NODE_ENV: "test" })).toBe(DEV_SESSION_SECRET);
  });

  it("refuses to run in production without a secret", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET is not set/);
    expect(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: "" })).toThrow(/not set/);
  });

  it("refuses the published development default and short secrets in production", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: DEV_SESSION_SECRET })).toThrow(/development default/);
    expect(() => resolveSessionSecret({ NODE_ENV: "production", SESSION_SECRET: "too-short" })).toThrow(/at least 32/);
  });

  it("treats Vercel as production even if a copied .env says development", () => {
    expect(isProductionEnv({ VERCEL: "1", NODE_ENV: "development" })).toBe(true);
    expect(() => resolveSessionSecret({ VERCEL: "1", NODE_ENV: "development" })).toThrow(/not set/);
  });
});

describe("server startup", () => {
  const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const loadApp = (env: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "-e", "await import('./src/app.ts'); console.log('loaded')"], {
      cwd: serverDir,
      env: { PATH: process.env.PATH ?? "", DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://x@localhost/x", ...env },
      encoding: "utf8",
      timeout: 60_000,
    });

  it("the app fails to load in production without a secret, and loads with one", () => {
    const refused = loadApp({ NODE_ENV: "production" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("SESSION_SECRET is not set");

    const ok = loadApp({ NODE_ENV: "production", SESSION_SECRET: STRONG });
    expect(ok.stdout).toContain("loaded");
    expect(ok.status).toBe(0);
  }, 120_000);
});
