"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, saveAdminSession } from "../../lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, data } = await apiPost<{ adminId: string; token: string }>("/api/v1/auth/admin-login", { email, password });
    setLoading(false);
    if (!ok) {
      setError("Invalid credentials.");
      return;
    }
    saveAdminSession({ adminId: data.adminId, token: data.token });
    router.push("/campaigns");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-semibold mb-8">DevAds Admin</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input className="input" type="email" placeholder="admin@devads.dev" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="text-xs text-muted mt-4">
        Demo login: <span className="font-mono">admin@devads.dev / admin12345</span>
      </p>
    </main>
  );
}
