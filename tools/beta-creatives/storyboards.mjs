// Storyboards for the DevAds first-party beta video creatives.
//
// Every claim below is taken from the product's own repository README (see
// SOURCES). Nothing here is a metric, a customer, or a capability the
// repository does not document. Each product has one storyboard; a scene
// appears in a variant when it has a duration for it, and each variant's
// scene durations sum exactly to the variant length (checked in render.mjs).

export const VARIANTS = [10, 15, 20];

export const SOURCES = {
  devads: "https://github.com/HenryMorganDibie/devads (README)",
  "schema-watch": "https://github.com/HenryMorganDibie/schema-watch (README)",
  "web-harvester": "https://github.com/HenryMorganDibie/web-harvester (README, CAPABILITIES.md)",
  "the-scribe": "https://github.com/HenryMorganDibie/the-scribe (README)",
};

export const PRODUCTS = [
  {
    slug: "schema-watch",
    name: "Schema-Watch",
    url: "github.com/HenryMorganDibie/schema-watch",
    theme: { bg: "#0b1020", panel: "#111727", fg: "#e8ecf4", muted: "#8b94a8", accent: "#5aa2ff", accent2: "#f28b3b", danger: "#ff6b6b", display: "mono" },
    scenes: [
      {
        type: "hook",
        d: { 10: 3, 15: 3.5, 20: 4 },
        eyebrow: "Schema-Watch",
        big: [
          { t: "id: ", c: "fg" },
          { t: "string", c: "accent" },
          { t: " → ", c: "muted" },
          { t: "number", c: "accent2" },
        ],
        sub: "Valid JSON. 200 OK. Nothing threw. Your frontend broke anyway.",
      },
      {
        type: "terminal",
        d: { 10: 4, 15: 5, 20: 5.5 },
        title: "schema-watch check",
        command: "npx schema-watch check --baseline .schema-watch/baseline.json",
        output: [
          { t: "BREAKING  GET /api/users/:id (response)", c: "danger" },
          { t: "    id: number → string", c: "fg" },
          { t: "    email was removed (was string)", c: "muted" },
          { t: "", c: "fg" },
          { t: "Breaking API contract changes detected.  exit 1", c: "danger" },
        ],
      },
      {
        type: "bullets",
        d: { 15: 3, 20: 3.5 },
        heading: "Diffs payload shape, not values",
        items: ["Field type changes", "Removed fields", "Nullability changes", "Optional → required"],
        note: "Changing timestamps, IDs and counts produce no noise.",
      },
      {
        type: "bullets",
        d: { 20: 4 },
        heading: "In CI, no account needed",
        items: ["Comments on the pull request", "Publishes a check run you can require", "Uploads SARIF to the Security tab"],
        note: "All with the built-in GITHUB_TOKEN.",
      },
      {
        type: "cta",
        d: { 10: 3, 15: 3.5, 20: 3 },
        name: "Schema-Watch",
        tagline: "Catch breaking API changes before they reach your users.",
        command: "npx schema-watch init",
      },
    ],
  },
  {
    slug: "web-harvester",
    name: "web-harvester",
    url: "github.com/HenryMorganDibie/web-harvester",
    theme: { bg: "#071417", panel: "#0c1d21", fg: "#e6f4f5", muted: "#86a3a8", accent: "#00add8", accent2: "#3fd48a", danger: "#ffb454", display: "mono" },
    scenes: [
      {
        type: "hook",
        d: { 10: 3, 15: 3, 20: 3.5 },
        eyebrow: "web-harvester",
        big: [
          { t: "Crawl any website.", c: "fg", br: true },
          { t: "Self-hosted, in Go.", c: "accent" },
        ],
        sub: "One acquisition stack: workers, proxies, rate limits, extraction.",
      },
      {
        type: "terminal",
        d: { 10: 4, 15: 4.5, 20: 5 },
        title: "cmd/crawl",
        command: "go run ./cmd/crawl -url https://example.com/ -depth 1 \\\n    -i-have-reviewed-tos",
        output: [
          { t: "→ one JSON line per page:", c: "accent2" },
          { t: "  url · status · content type · latency", c: "fg" },
          { t: "  title · meta · headings · OpenGraph", c: "fg" },
          { t: "  JSON-LD · text · links", c: "fg" },
          { t: "  + your CSS-selector fields per site", c: "muted" },
        ],
      },
      {
        type: "bullets",
        d: { 15: 4, 20: 4 },
        heading: "Blocks are routed around, never bypassed",
        items: ["CAPTCHA · rate limit · consent wall · JS check", "Retry-After honored, adaptive per-host limits", "robots.txt obeyed by default"],
      },
      {
        type: "pipeline",
        d: { 20: 3.5 },
        heading: "Scales out on your own infrastructure",
        nodes: ["Redis Streams", "Worker pool", "HTTP or Chromium", "PostgreSQL / JSONL", "Prometheus + Grafana"],
      },
      {
        type: "cta",
        d: { 10: 3, 15: 3.5, 20: 4 },
        name: "web-harvester",
        tagline: "Self-hosted web data acquisition in Go.",
        command: "go run ./cmd/harvester -mode mock   # runs offline",
      },
    ],
  },
  {
    slug: "the-scribe",
    name: "The Scribe",
    url: "github.com/HenryMorganDibie/the-scribe",
    theme: { bg: "#f6f1ea", panel: "#fffaf3", fg: "#2b2520", muted: "#7a6d62", accent: "#b5533c", accent2: "#8a6a2f", danger: "#b5533c", display: "serif", light: true },
    scenes: [
      {
        type: "hook",
        d: { 10: 3.5, 15: 3.5, 20: 4 },
        eyebrow: "The Scribe",
        big: [
          { t: "An AI ghostwriter", c: "fg", br: true },
          { t: "that writes in the author's voice.", c: "accent" },
        ],
        sub: "For Christian authors, and grounded in their own material.",
      },
      {
        type: "pipeline",
        d: { 10: 3.5, 15: 4, 20: 4.5 },
        heading: "How a chapter gets written",
        nodes: ["Voice interview", "Versioned voice profile", "pgvector retrieval", "Chapter in their voice"],
      },
      {
        type: "bullets",
        d: { 15: 4, 20: 4 },
        heading: "Under the hood",
        items: ["FastAPI, React and Postgres with pgvector", "Voice-match scoring to catch drift", "Chapter memory from prior-chapter summaries"],
      },
      {
        type: "bullets",
        d: { 20: 3.5 },
        heading: "Built to run anywhere",
        items: ["LLM provider rotation with health-based cooldowns", "Local setup with Docker Compose", "DOCX export of the manuscript"],
      },
      {
        type: "cta",
        d: { 10: 3, 15: 3.5, 20: 4 },
        name: "The Scribe",
        tagline: "Personalized voice modeling for long-form manuscripts.",
      },
    ],
  },
  {
    slug: "devads",
    name: "DevAds",
    url: "devads-app.vercel.app/join",
    theme: { bg: "#08090a", panel: "#111215", fg: "#edece8", muted: "#8d8c86", accent: "#62dfa8", accent2: "#f0b35b", danger: "#7ea6ff", display: "sans" },
    scenes: [
      {
        type: "hook",
        d: { 10: 3, 15: 3.5, 20: 3.5 },
        eyebrow: "DevAds",
        big: [
          { t: "Build with AI.", c: "fg", br: true },
          { t: "Get sponsored.", c: "accent" },
        ],
        sub: "The sponsorship infrastructure for AI-powered development.",
      },
      {
        type: "pipeline",
        d: { 10: 4, 15: 4, 20: 4.5 },
        heading: "How it works",
        nodes: ["Sponsor campaign", "Your engagement", "Verified outcome", "Reward", "Wallet"],
      },
      {
        type: "bullets",
        d: { 15: 4, 20: 4 },
        heading: "Verified on the server, private by design",
        items: ["Completions verified server-side", "Idempotent, auditable reward ledger", "No source code. No prompts. No model responses. No secrets."],
      },
      {
        type: "bullets",
        d: { 20: 4 },
        heading: "Now in developer beta",
        items: ["Sign in with GitHub or Google", "Opportunities run and funded by DevAds", "Beta Credits are not cash"],
        note: "There are no external sponsors yet.",
      },
      {
        type: "cta",
        d: { 10: 3, 15: 3.5, 20: 4 },
        name: "DevAds",
        tagline: "Join the Developer Beta.",
      },
    ],
  },
];
