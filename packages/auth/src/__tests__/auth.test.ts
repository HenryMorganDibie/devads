import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";
import { signSession, verifySession } from "../session.js";
import { createMagicLinkToken, verifyMagicLinkToken } from "../magicLink.js";
import { generateDeviceCode, generateUserCode } from "../deviceCode.js";

const SECRET = "test-secret-at-least-32-characters-long";

describe("password", () => {
  it("hashes and verifies correctly", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("session", () => {
  it("round-trips a valid session token", () => {
    const token = signSession({ sub: "user_1", role: "DEVELOPER" }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ sub: "user_1", role: "DEVELOPER" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSession({ sub: "user_1", role: "DEVELOPER" }, SECRET);
    expect(verifySession(token, "a-completely-different-secret-value")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession({ sub: "user_1", role: "DEVELOPER" }, SECRET, -1);
    expect(verifySession(token, SECRET)).toBeNull();
  });
});

describe("magic link", () => {
  it("round-trips a valid magic link token", () => {
    const token = createMagicLinkToken("dev@example.com", SECRET);
    expect(verifyMagicLinkToken(token, SECRET)).toEqual({ email: "dev@example.com" });
  });

  it("rejects an expired magic link token", () => {
    const token = createMagicLinkToken("dev@example.com", SECRET, -1);
    expect(verifyMagicLinkToken(token, SECRET)).toBeNull();
  });

  it("rejects a session token passed as a magic link token", () => {
    const sessionToken = signSession({ sub: "user_1", role: "DEVELOPER" }, SECRET);
    expect(verifyMagicLinkToken(sessionToken, SECRET)).toBeNull();
  });
});

describe("device codes", () => {
  it("generates unique device codes", () => {
    const a = generateDeviceCode();
    const b = generateDeviceCode();
    expect(a).not.toBe(b);
  });

  it("generates human-typeable user codes in XXXX-XXXX format", () => {
    const code = generateUserCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});
