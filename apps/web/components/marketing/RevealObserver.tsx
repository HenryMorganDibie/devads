"use client";

import { useEffect } from "react";

/**
 * One observer for the whole page: marks `[data-reveal]`, `[data-grow]` and `.mk-seq`
 * elements with `data-inview` as they enter the viewport. Elements already
 * on screen are marked before hiding is enabled, so nothing flickers.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mk");
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal], [data-grow], .mk-seq"));
    const vh = window.innerHeight;
    for (const el of targets) {
      if (el.getBoundingClientRect().top < vh * 0.92) el.setAttribute("data-inview", "");
    }
    root.classList.add("mk-reveal-ready");

    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.setAttribute("data-inview", ""));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-inview", "");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    targets.filter((el) => !el.hasAttribute("data-inview")).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
