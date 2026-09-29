import type { CSSProperties, ReactNode } from "react";

export type Flow = "fund" | "value" | "signal";

export const FLOW_TEXT: Record<Flow, string> = {
  fund: "text-fund",
  value: "text-value",
  signal: "text-signal",
};

export const FLOW_BG: Record<Flow, string> = {
  fund: "bg-fund",
  value: "bg-value",
  signal: "bg-signal",
};

export const FLOW_HEX: Record<Flow, string> = {
  fund: "#f0b35b",
  value: "#62dfa8",
  signal: "#7ea6ff",
};

/** Horizontal page container shared by every section. */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

/**
 * A page section. Sections are separated by a hairline and a consistent
 * vertical rhythm rather than by changing backgrounds.
 */
export function Section({
  id,
  labelledBy,
  children,
  className = "",
  bordered = true,
}: {
  id?: string;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative py-24 sm:py-32 ${bordered ? "border-t mk-hairline" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

/** Mono section index + label, e.g. "02 / The problem". */
export function Eyebrow({ index, children, className = "" }: { index?: string; children: ReactNode; className?: string }) {
  return (
    <p className={`mk-eyebrow flex items-center gap-3 ${className}`}>
      {index && <span className="text-[color:var(--mk-dim)]">{index}</span>}
      {index && <span aria-hidden className="h-px w-6 bg-white/15" />}
      <span>{children}</span>
    </p>
  );
}

export function PreviewTag({ children = "Conceptual preview" }: { children?: ReactNode }) {
  return (
    <span className="mk-tag">
      <span aria-hidden className="h-1 w-1 rounded-full bg-white/40" />
      {children}
    </span>
  );
}

/** Marks content for the scroll-reveal observer. */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  children,
}: {
  as?: "div" | "li" | "p" | "span" | "figure";
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag data-reveal="" className={className} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`mk-arrow h-3.5 w-3.5 ${className}`} fill="none">
      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="none">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cross({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${className}`} fill="none">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The DevAds mark: two offset brackets meeting at a node (sponsor, exchange, developer). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none">
        <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.25" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        <path d="M8 6.5 4.5 12 8 17.5" stroke="#f0b35b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 6.5 19.5 12 16 17.5" stroke="#62dfa8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.1" fill="#f3f1ec" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-[-0.03em]">DevAds</span>
    </span>
  );
}
