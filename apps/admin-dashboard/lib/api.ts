export const AD_SERVER_URL = process.env.NEXT_PUBLIC_AD_SERVER_URL ?? "http://localhost:4000";

const KEY = "devads:admin-session";

export function saveAdminId(adminId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, adminId);
}

export function loadAdminId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function clearAdminId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export async function apiPost<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${AD_SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet<T>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${AD_SERVER_URL}${path}`);
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
