import { ImageResponse } from "next/og";

export const alt = "DevAds: the sponsorship infrastructure for AI-powered development";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#08090a",
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          color: "#edece8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#f0b35b" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#7ea6ff" }} />
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#62dfa8" }} />
          </div>
          DevAds
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
          <span>Build with AI.</span>
          <span style={{ color: "#62dfa8" }}>Get sponsored.</span>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#8d8d95" }}>
          The sponsorship infrastructure for AI-powered development.
        </div>
      </div>
    ),
    size
  );
}
