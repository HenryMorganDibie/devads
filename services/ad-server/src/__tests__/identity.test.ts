import { describe, expect, it } from "vitest";
import { identityVerifierFromEnv, isAllowedOAuthProvider, supabaseIdentityVerifier } from "../lib/identity.js";

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

const URL = "https://project.supabase.co/";

describe("supabaseIdentityVerifier", () => {
  it("asks Supabase who the token belongs to and maps the answer", async () => {
    const { fetch, calls } = fakeFetch(200, {
      id: "3f0c7c2e-1111-2222-3333-444455556666",
      email: "Dev@Example.com",
      app_metadata: { provider: "github" },
      user_metadata: { user_name: "octodev", full_name: "  Octo Dev  " },
    });
    const identity = await supabaseIdentityVerifier({ url: URL, publishableKey: "pk", fetch }).verify("token-123");

    expect(calls).toEqual([
      { url: "https://project.supabase.co/auth/v1/user", headers: { apikey: "pk", authorization: "Bearer token-123" } },
    ]);
    expect(identity).toEqual({
      subject: "supabase:3f0c7c2e-1111-2222-3333-444455556666",
      email: "dev@example.com",
      provider: "github",
      displayName: "Octo Dev",
    });
  });

  it("treats tokens Supabase rejects as invalid", async () => {
    for (const status of [401, 403]) {
      const { fetch } = fakeFetch(status, { msg: "invalid JWT" });
      expect(await supabaseIdentityVerifier({ url: URL, publishableKey: "pk", fetch }).verify("t")).toBeNull();
    }
    const { fetch } = fakeFetch(200, { email: "no-id@example.com" });
    expect(await supabaseIdentityVerifier({ url: URL, publishableKey: "pk", fetch }).verify("t")).toBeNull();
  });

  it("fails closed when Supabase is unavailable, rather than treating the token as valid", async () => {
    const { fetch } = fakeFetch(500, {});
    await expect(supabaseIdentityVerifier({ url: URL, publishableKey: "pk", fetch }).verify("t")).rejects.toThrow(
      /supabase_auth_unavailable_500/
    );
  });

  it("is disabled unless both the Supabase URL and publishable key are configured", () => {
    expect(identityVerifierFromEnv({})).toBeNull();
    expect(identityVerifierFromEnv({ SUPABASE_URL: URL })).toBeNull();
    expect(identityVerifierFromEnv({ SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: "  " })).toBeNull();
    expect(identityVerifierFromEnv({ SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: "pk" })).not.toBeNull();
  });
});

describe("isAllowedOAuthProvider", () => {
  it("accepts OAuth providers and refuses Supabase's non-OAuth sign-in methods", () => {
    expect(isAllowedOAuthProvider("github")).toBe(true);
    for (const method of ["email", "phone", "anonymous", "", null]) expect(isAllowedOAuthProvider(method)).toBe(false);
  });
});
