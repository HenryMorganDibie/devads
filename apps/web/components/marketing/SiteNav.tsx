"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LINKS } from "../../lib/site";
import { Logo } from "./primitives";

const NAV = [
  { href: "#developers", label: "Developers" },
  { href: "#sponsors", label: "Sponsors" },
  { href: "#platforms", label: "Platforms" },
  { href: "#how-it-works", label: "How it works" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const compact = scrolled || open;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
      <div
        className={`mx-auto max-w-page rounded-2xl border transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
          compact
            ? "border-white/[0.08] bg-[#0b0c0e]/80 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <nav
          aria-label="Primary"
          className={`flex items-center justify-between px-3 transition-[height] duration-300 sm:px-4 ${compact ? "h-14" : "h-16"}`}
        >
          <Link href="/" aria-label="DevAds home" className="flex h-11 items-center rounded-md">
            <Logo />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-[14px] text-[color:var(--mk-muted)] transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5">
            <Link
              href={LINKS.signIn}
              className="hidden rounded-full px-3.5 py-2 text-[14px] text-[color:var(--mk-muted)] transition-colors hover:text-white sm:inline-flex"
            >
              Sign in
            </Link>
            <Link href={LINKS.signUp} className="mk-btn mk-btn-primary !h-9 !px-4 !text-[14px]">
              Join the beta
            </Link>
            <button
              type="button"
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                <path
                  d={open ? "M4 4l8 8M12 4l-8 8" : "M2.5 5.5h11M2.5 10.5h11"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </nav>

        <div id="mobile-nav" hidden={!open} className="border-t border-white/[0.06] px-3 pb-3 pt-2 lg:hidden">
          <ul className="grid grid-cols-2 gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center rounded-xl px-3 text-[15px] text-[color:var(--mk-text)] hover:bg-white/[0.04]"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="col-span-2">
              <Link
                href={LINKS.signIn}
                className="flex h-11 items-center rounded-xl px-3 text-[15px] text-[color:var(--mk-muted)] hover:bg-white/[0.04]"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
