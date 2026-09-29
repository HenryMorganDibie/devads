import { DevAdsClient } from "@devads/ad-sdk";
import type {
  DevelopmentSessionListResponse,
  DeveloperMeResponse,
  OAuthExchangeResponse,
  SponsorshipHistoryResponse,
} from "@devads/shared";
import { AD_SERVER_URL, apiGet, apiPatch, apiPost, loadSession, saveSession } from "./api";

export { BETA_TERMS_VERSION } from "@devads/shared";
export type { DeveloperMeResponse, DevelopmentSessionListResponse, SponsorshipHistoryResponse };

/**
 * Only same-site paths are accepted as a post-sign-in destination, so a
 * crafted ?next= can never send a freshly signed-in developer to another site.
 */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  email_in_use_by_another_account:
    "That email already belongs to a DevAds account that signs in with a password. Sign in with your email and password instead.",
  oauth_email_required: "Your account did not share an email address. Make an email visible to DevAds on your provider and try again.",
  oauth_provider_not_allowed: "That sign-in method is not available for the developer beta.",
  oauth_not_configured: "Sign-in with GitHub or Google is not configured on this deployment yet.",
  invalid_oauth_token: "Your sign-in expired before it finished. Please try again.",
  identity_provider_unavailable: "The sign-in service is unavailable right now. Please try again in a moment.",
  not_a_developer_account: "This sign-in belongs to a non-developer account.",
};

/** Supabase access token in, DevAds session out (verified server-side). */
export async function exchangeOAuthToken(accessToken: string): Promise<OAuthExchangeResponse> {
  const { ok, data } = await apiPost<OAuthExchangeResponse & { error?: string }>("/api/v1/auth/oauth/exchange", { accessToken });
  if (!ok) throw new Error(data.error ?? "oauth_exchange_failed");
  saveSession({ token: data.token, userId: data.userId, developerId: data.developerId });
  return data;
}

export async function fetchMe(): Promise<DeveloperMeResponse | null> {
  const { ok, data } = await apiGet<DeveloperMeResponse>("/api/v1/me/developer");
  return ok ? data : null;
}

export async function joinBeta(termsVersion: string): Promise<DeveloperMeResponse | null> {
  const { ok, data } = await apiPost<DeveloperMeResponse>("/api/v1/me/beta", { acceptTerms: true, termsVersion });
  return ok ? data : null;
}

export async function setSponsorshipsEnabled(developerId: string, enabled: boolean): Promise<boolean> {
  const { ok } = await apiPatch(`/api/v1/developers/${developerId}/preferences`, { adsEnabled: enabled });
  return ok;
}

export async function fetchSessions(): Promise<DevelopmentSessionListResponse | null> {
  const { ok, data } = await apiGet<DevelopmentSessionListResponse>("/api/v1/sessions");
  return ok ? data : null;
}

export async function fetchHistory(): Promise<SponsorshipHistoryResponse | null> {
  const { ok, data } = await apiGet<SponsorshipHistoryResponse>("/api/v1/me/sponsorship-history");
  return ok ? data : null;
}

/**
 * The web app is a first-party protocol client (client type WEB): it talks to
 * the sponsorship core through the same SDK as any other adapter, so offers,
 * events and rewards follow exactly the same server-side rules.
 */
export function protocolClient(): DevAdsClient {
  return new DevAdsClient({
    baseUrl: AD_SERVER_URL,
    credentials: {
      token: () => loadSession()?.token ?? null,
      developerId: () => loadSession()?.developerId ?? null,
    },
  });
}

const WEB_SESSION_KEY = "devads:web-session";

/** Reuses this tab's active WEB development session, or starts one. */
export async function webSessionId(client: DevAdsClient): Promise<string> {
  const existing = typeof window !== "undefined" ? window.sessionStorage.getItem(WEB_SESSION_KEY) : null;
  if (existing) return existing;
  const session = await client.startSession({ clientType: "WEB", clientVersion: "web-beta" });
  window.sessionStorage.setItem(WEB_SESSION_KEY, session.id);
  return session.id;
}

export function forgetWebSession() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(WEB_SESSION_KEY);
}
