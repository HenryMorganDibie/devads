"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, saveSession } from "../../lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, data } = await apiPost<{ userId: string; advertiserId: string; error?: string }>(
      "/api/v1/advertisers/signup",
      { email, password, companyName, website: website || undefined }
    );
    setLoading(false);
    if (!ok) {
      setError(data.error === "email_already_registered" ? "That email is already registered." : "Signup failed.");
      return;
    }
    saveSession({ userId: data.userId, advertiserId: data.advertiserId });
    router.push("/campaigns");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-semibold mb-1">Create an advertiser account</h1>
      <p className="text-sm text-muted mb-8">Reach developers inside the tools they use to build.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <input className="input" placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        <input className="input" placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <input className="input" type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="text-sm text-muted mt-6">
        Already have an account? <Link href="/login" className="text-accent">Sign in</Link>
      </p>
    </main>
  );
}
