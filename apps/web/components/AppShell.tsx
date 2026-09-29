"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, loadSession } from "../lib/api";
import { fetchMe, forgetWebSession, type DeveloperMeResponse } from "../lib/beta";

interface DeveloperContextValue {
  me: DeveloperMeResponse;
  refresh: () => Promise<void>;
}

const DeveloperContext = createContext<DeveloperContextValue | null>(null);

export function useDeveloper(): DeveloperContextValue {
  const value = useContext(DeveloperContext);
  if (!value) throw new Error("useDeveloper must be used inside <AppShell>");
  return value;
}

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/wallet", label: "Wallet" },
  { href: "/app/sessions", label: "Sessions" },
];

export function signOut(router: { replace(href: string): void }) {
  clearSession();
  forgetWebSession();
  router.replace("/");
}

/**
 * Guard and chrome for /app/*: no DevAds session -> /login?next=<here>;
 * signed in but not yet in the beta -> onboarding. The server still checks
 * the session on every request; this only decides what to render.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<DeveloperMeResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const session = loadSession();
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const result = await fetchMe().catch(() => undefined);
    if (result === undefined) {
      setFailed(true);
      return;
    }
    if (result === null) {
      clearSession();
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setFailed(false);
    setMe(result);
  }, [pathname, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const onboarding = pathname === "/app/onboarding";
  useEffect(() => {
    if (me && !me.betaJoinedAt && !onboarding) router.replace("/app/onboarding");
  }, [me, onboarding, router]);

  if (failed) {
    return (
      <main className="max-w-md mx-auto px-6 py-24" role="alert">
        <p className="mb-4">We could not reach DevAds. Check your connection and try again.</p>
        <button className="btn-primary" onClick={() => void load()}>
          Try again
        </button>
      </main>
    );
  }
  if (!me || (!me.betaJoinedAt && !onboarding)) {
    return <main className="max-w-md mx-auto px-6 py-24 text-muted">Loading...</main>;
  }

  return (
    <DeveloperContext.Provider value={{ me, refresh: load }}>
      <header className="border-b border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/" className="font-semibold">
            DevAds
          </Link>
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] rounded border border-accent/40 text-accent px-1.5 py-0.5">
            Beta
          </span>
          {!onboarding && (
            <nav aria-label="Developer app" className="order-last w-full sm:order-none sm:w-auto flex gap-1 text-sm -ml-2.5 sm:ml-0">
              {NAV.map((item) =>
                item.href === pathname ? (
                  <span key={item.href} aria-current="page" className="px-2.5 py-1 rounded-md bg-white/10">
                    {item.label}
                  </span>
                ) : (
                  <Link key={item.href} href={item.href} className="px-2.5 py-1 rounded-md text-muted hover:text-white">
                    {item.label}
                  </Link>
                )
              )}
            </nav>
          )}
          <button className="ml-auto text-sm text-muted hover:text-white shrink-0" onClick={() => signOut(router)}>
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
    </DeveloperContext.Provider>
  );
}
