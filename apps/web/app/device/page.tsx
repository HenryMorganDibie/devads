"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, loadSession } from "../../lib/api";

export default function DevicePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!loadSession()) {
      router.push(`/login?next=/device`);
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const session = loadSession();
    if (!session) return;
    setStatus("loading");
    const { ok } = await apiPost("/api/v1/auth/device/approve", {
      userCode: code.trim().toUpperCase(),
      userId: session.userId,
    });
    setStatus(ok ? "done" : "error");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-semibold mb-2">Connect VS Code</h1>
      <p className="text-sm text-muted mb-8">
        Enter the code shown in the DevAds sign-in prompt in your editor.
      </p>
      {status === "done" ? (
        <p className="text-sm text-accent">Connected. You can return to VS Code now.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="input font-mono tracking-widest text-center"
            placeholder="XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          {status === "error" && <p className="text-sm text-red-400">Invalid or expired code.</p>}
          <button className="btn-primary w-full" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Connecting..." : "Connect"}
          </button>
        </form>
      )}
    </main>
  );
}
