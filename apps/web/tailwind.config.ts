import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0b",
        surface: "#111113",
        border: "#22222633",
        muted: "#8a8a92",
        accent: "#5b8def",
        // Marketing flow colors. Each one means one thing everywhere on the
        // public site: sponsor funding, developer value, verified engagement.
        fund: "#f0b35b",
        value: "#62dfa8",
        signal: "#7ea6ff",
        bone: "#f3f1ec",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: {
        page: "76rem",
      },
    },
  },
  plugins: [],
};

export default config;
