export const AD_SERVER_URL = process.env.NEXT_PUBLIC_AD_SERVER_URL ?? "http://localhost:4000";

export interface AdvertiserSession {
  userId: string;
  advertiserId: string;
  token: string;
}

const KEY = "devads:advertiser-session";

export function saveSession(s: AdvertiserSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function loadSession(): AdvertiserSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdvertiserSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

function authHeaders(): Record<string, string> {
  const session = loadSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

export async function apiPost<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${AD_SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet<T>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${AD_SERVER_URL}${path}`, { headers: authHeaders() });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Uploads a single file as multipart/form-data. Never set Content-Type
 * manually here -- the browser must generate the multipart boundary. */
export async function apiUpload<T>(path: string, file: File): Promise<{ ok: boolean; status: number; data: T }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${AD_SERVER_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
