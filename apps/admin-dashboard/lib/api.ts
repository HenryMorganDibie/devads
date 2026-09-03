export const AD_SERVER_URL = process.env.NEXT_PUBLIC_AD_SERVER_URL ?? "http://localhost:4000";

interface AdminSession {
  adminId: string;
  token: string;
}

const KEY = "devads:admin-session";

export function saveAdminSession(session: AdminSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function loadAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function loadAdminId(): string | null {
  return loadAdminSession()?.adminId ?? null;
}

export function clearAdminId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

function authHeaders(): Record<string, string> {
  const session = loadAdminSession();
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

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
