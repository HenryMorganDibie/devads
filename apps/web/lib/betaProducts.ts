/**
 * DevAds-owned products shown in the first-party beta video campaigns. Every
 * statement is taken from the product's own repository README; nothing here
 * is a metric, a customer, or an undocumented capability. The slugs match
 * packages/database/seed/betaVideo.ts and tools/beta-creatives.
 */
export interface BetaProduct {
  slug: string;
  name: string;
  tagline: string;
  what: string;
  why: string[];
  repoUrl: string;
  tryIt?: string;
}

export const BETA_PRODUCTS: BetaProduct[] = [
  {
    slug: "schema-watch",
    name: "Schema-Watch",
    tagline: "Catch breaking API changes before they reach your users.",
    what: "Schema-Watch captures the shape of your API's payloads and compares it against a committed baseline. When a field changes type, disappears, becomes nullable or turns required, it reports the breaking change, lists the frontend files that reference the endpoint, and exits with code 1 so the build fails instead of your frontend.",
    why: [
      "Diffs payload shape, not values, so changing timestamps, IDs and counts produce no noise.",
      "Runs in CI with no account: comments on the pull request, publishes a check run you can require, and uploads SARIF.",
      "The local proxy, dashboard and detection engine are open source and make no network calls unless you ask them to.",
    ],
    repoUrl: "https://github.com/HenryMorganDibie/schema-watch",
    tryIt: "npx schema-watch init --target http://localhost:3001",
  },
  {
    slug: "web-harvester",
    name: "web-harvester",
    tagline: "Self-hosted web data acquisition in Go.",
    what: "web-harvester is a self-hosted Go acquisition stack with a general-purpose crawler: start URLs, scoped link following, and structured page data (metadata, headings, OpenGraph, JSON-LD, text, links) plus per-site CSS-selector extraction, over plain HTTP or headless Chromium.",
    why: [
      "Blocks such as CAPTCHAs, rate limits, consent walls and JS checks are classified and routed around, never bypassed; robots.txt is obeyed by default.",
      "A concurrent worker pool, proxy health tracking, adaptive rate limiting that honors Retry-After, and a Redis Streams queue for scaling out.",
      "PostgreSQL or JSON-Lines persistence and Prometheus metrics with a Grafana dashboard. It runs end to end offline in mock mode.",
    ],
    repoUrl: "https://github.com/HenryMorganDibie/web-harvester",
    tryIt: "go run ./cmd/harvester -config configs/config.example.yaml -mode mock",
  },
  {
    slug: "the-scribe",
    name: "The Scribe",
    tagline: "An AI ghostwriter that writes in the author's own voice.",
    what: "The Scribe is an AI writing assistant for Christian authors. It interviews an author about their theological lens, phrases, anchor scriptures, cadence and testimonies, builds a versioned voice profile, and drafts manuscript chapters in that voice, retrieving the author's own material with pgvector embeddings rather than stuffing everything into one prompt.",
    why: [
      "A FastAPI backend, React frontend, and Postgres with pgvector for retrieval.",
      "Voice-match scoring to catch drift, and chapter memory built from summaries of prior chapters.",
      "LLM provider rotation with health-based cooldowns, local setup with Docker Compose, and DOCX export.",
    ],
    repoUrl: "https://github.com/HenryMorganDibie/the-scribe",
  },
  {
    slug: "devads",
    name: "DevAds",
    tagline: "The sponsorship infrastructure for AI-powered development.",
    what: "DevAds lets organizations sponsor developers. Developers opt in and receive rewards while they build, and DevAds verifies and manages the exchange: sponsor campaign, developer engagement, verified outcome, reward, wallet.",
    why: [
      "Completions are verified on the server, and the reward ledger is idempotent and auditable.",
      "No source code. No prompts. No model responses. No secrets.",
      "Now in developer beta: every opportunity is run and funded by DevAds, and there are no external sponsors yet.",
    ],
    repoUrl: "https://github.com/HenryMorganDibie/devads",
  },
];

export function betaProduct(slug: string): BetaProduct | undefined {
  return BETA_PRODUCTS.find((p) => p.slug === slug);
}
