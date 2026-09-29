import { FLOW_HEX, Logo } from "./primitives";

// Coordinate system for the diagram. Nodes are HTML overlays positioned in
// percentages of this box so labels stay crisp at every size.
const W = 440;
const H = 540;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

const PATHS = {
  fund: "M 168 88 C 96 134, 96 214, 178 254",
  value: "M 178 286 C 96 326, 96 406, 168 452",
  signal: "M 272 452 C 372 398, 372 142, 272 88",
} as const;

function Particles({ path, color, count, dur }: { path: string; color: string; count: number; dur: number }) {
  return (
    <g className="mk-particle">
      {Array.from({ length: count }, (_, i) => (
        <g key={i}>
          <circle r="6" fill={color} opacity="0.18">
            <animateMotion dur={`${dur}s`} begin={`-${(i * dur) / count}s`} repeatCount="indefinite">
              <mpath href={`#${path}`} />
            </animateMotion>
          </circle>
          <circle r="2.2" fill={color}>
            <animateMotion dur={`${dur}s`} begin={`-${(i * dur) / count}s`} repeatCount="indefinite">
              <mpath href={`#${path}`} />
            </animateMotion>
          </circle>
        </g>
      ))}
    </g>
  );
}

function Node({
  x,
  y,
  color,
  title,
  detail,
}: {
  x: number;
  y: number;
  color: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(x, y)}>
      <div className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-white/10 bg-[#0e0f12]/95 py-1.5 pl-2 pr-3.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]">
        <span className="relative flex h-5 w-5 items-center justify-center rounded-full" style={{ background: `${color}1f` }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        </span>
        <span className="text-[13px] font-medium tracking-[-0.01em] text-[color:var(--mk-text)]">{title}</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--mk-dim)] sm:inline">{detail}</span>
      </div>
    </div>
  );
}

function FlowLabel({ x, y, color, children, align = "right" }: { x: number; y: number; color: string; children: string; align?: "left" | "right" }) {
  return (
    <span
      className={`absolute -translate-y-1/2 font-mono text-[9.5px] uppercase tracking-[0.14em] ${align === "right" ? "-translate-x-full text-right" : ""}`}
      style={{ ...pct(x, y), color }}
    >
      {children}
    </span>
  );
}

/**
 * The hero diagram: Sponsor -> DevAds -> Developer, with funding and value
 * flowing down the left lane and verified engagement returning up the right.
 * It reads as a complete, labelled loop with animation disabled.
 */
export function HeroSystem() {
  return (
    <figure
      className="relative mx-auto w-full max-w-[380px]"
      style={{ aspectRatio: `${W} / ${H}` }}
      aria-label="Diagram: a sponsor funds DevAds, DevAds delivers a reward to a developer, and verified engagement returns to the sponsor."
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <path id="hero-fund" d={PATHS.fund} />
          <path id="hero-value" d={PATHS.value} />
          <path id="hero-signal" d={PATHS.signal} />
          <radialGradient id="hero-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <marker id="hero-head-fund" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1l5 3-5 3" fill="none" stroke={FLOW_HEX.fund} strokeWidth="1.2" />
          </marker>
          <marker id="hero-head-value" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1l5 3-5 3" fill="none" stroke={FLOW_HEX.value} strokeWidth="1.2" />
          </marker>
          <marker id="hero-head-signal" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1l5 3-5 3" fill="none" stroke={FLOW_HEX.signal} strokeWidth="1.2" />
          </marker>
        </defs>

        {/* core rings */}
        <circle cx="220" cy="270" r="118" fill="url(#hero-core-glow)" />
        <circle cx="220" cy="270" r="86" fill="none" stroke="rgba(255,255,255,0.06)" />
        <circle cx="220" cy="270" r="62" fill="none" stroke="rgba(255,255,255,0.1)" strokeDasharray="1 5" className="mk-spin-slow" />
        <line x1="220" y1="104" x2="220" y2="208" stroke="rgba(255,255,255,0.06)" />
        <line x1="220" y1="332" x2="220" y2="436" stroke="rgba(255,255,255,0.06)" />

        {/* lanes: faint base line + animated dashes + arrowhead */}
        <path d={PATHS.fund} className="mk-flow-path" stroke={FLOW_HEX.fund} strokeOpacity="0.2" />
        <path d={PATHS.fund} className="mk-flow-path mk-flow-dash" stroke={FLOW_HEX.fund} strokeOpacity="0.55" markerEnd="url(#hero-head-fund)" />
        <path d={PATHS.value} className="mk-flow-path" stroke={FLOW_HEX.value} strokeOpacity="0.2" />
        <path d={PATHS.value} className="mk-flow-path mk-flow-dash" stroke={FLOW_HEX.value} strokeOpacity="0.55" markerEnd="url(#hero-head-value)" />
        <path d={PATHS.signal} className="mk-flow-path" stroke={FLOW_HEX.signal} strokeOpacity="0.2" />
        <path d={PATHS.signal} className="mk-flow-path mk-flow-dash" stroke={FLOW_HEX.signal} strokeOpacity="0.55" markerEnd="url(#hero-head-signal)" />

        {/* DevAds verifies engagement on its way back to the sponsor */}
        <line x1="268" y1="270" x2="340" y2="270" stroke={FLOW_HEX.signal} strokeOpacity="0.35" strokeDasharray="2 4" />
        <circle cx="347" cy="270" r="9" fill="#0d0e11" stroke={FLOW_HEX.signal} strokeOpacity="0.7" />
        <path d="M343 270.5l2.6 2.6 5-5.4" fill="none" stroke={FLOW_HEX.signal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        <Particles path="hero-fund" color={FLOW_HEX.fund} count={3} dur={3.6} />
        <Particles path="hero-value" color={FLOW_HEX.value} count={3} dur={3.6} />
        <Particles path="hero-signal" color={FLOW_HEX.signal} count={4} dur={6} />
      </svg>

      <Node x={220} y={70} color={FLOW_HEX.fund} title="Sponsor" detail="funds a campaign" />
      <Node x={220} y={470} color={FLOW_HEX.value} title="Developer" detail="opts in" />

      {/* core */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(220, 270)}>
        <div className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] border border-white/15 bg-gradient-to-b from-[#17181c] to-[#0c0d10] shadow-[0_0_0_6px_rgba(255,255,255,0.02),0_20px_60px_-20px_rgba(0,0,0,1)] sm:h-[88px] sm:w-[88px] sm:rounded-[24px]">
          <Logo className="[&>span]:hidden [&_svg]:h-9 [&_svg]:w-9" />
        </div>
        <p className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--mk-muted)]">
          DevAds core
        </p>
      </div>

      <FlowLabel x={106} y={166} color={FLOW_HEX.fund}>Funding</FlowLabel>
      <FlowLabel x={106} y={374} color={FLOW_HEX.value}>Reward</FlowLabel>
      <FlowLabel x={352} y={232} color={FLOW_HEX.signal} align="left">Verified</FlowLabel>
      <FlowLabel x={352} y={246} color={FLOW_HEX.signal} align="left">engagement</FlowLabel>
    </figure>
  );
}
