import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { BETA_ADVERTISER_ID } from "./betaIds.js";

/**
 * First-party beta VIDEO campaigns: DevAds acting as the sponsor for its own
 * products, on the same campaign / offer / verification / ledger
 * infrastructure an external sponsor's video campaign will use. Each
 * campaign is `mode: BETA` and grants Beta Credits (not cash).
 *
 * The video is the creative, not the qualifying action. The reward requires
 * the DevAds-controlled action on the offer: open the product page on the
 * DevAds site from the offer, stay at least `minEngagementSeconds`, and
 * confirm. The server verifies that timing from its own events.
 *
 * Creatives come from the render manifest written by tools/beta-creatives,
 * so the database only ever references files that were actually rendered
 * and served by the web app, with their content hashes.
 */

interface ManifestEntry {
  product: string;
  durationSeconds: number;
  file: string;
  poster: string;
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
  /** VP9 WebM rendition of the same cut (the preferred source). */
  webm?: { file: string; mimeType: string; bytes: number; sha256: string };
}

export const BETA_VIDEO_PRODUCTS = [
  {
    slug: "schema-watch",
    name: "Schema-Watch",
    title: "DevAds Beta Opportunity: Schema-Watch catches breaking API changes",
    description:
      "Schema-Watch diffs API payload shapes and fails your build on a breaking change, naming the frontend files that reference the endpoint. A DevAds-owned project, shown as part of the DevAds developer beta.",
  },
  {
    slug: "web-harvester",
    name: "web-harvester",
    title: "DevAds Beta Opportunity: web-harvester, self-hosted web data acquisition in Go",
    description:
      "A self-hosted Go crawler with a worker pool, proxy health tracking, adaptive rate limits and structured page extraction. Blocks are detected and routed around, never bypassed. A DevAds-owned project, shown as part of the DevAds developer beta.",
  },
  {
    slug: "the-scribe",
    name: "The Scribe",
    title: "DevAds Beta Opportunity: The Scribe, an AI ghostwriter in the author's own voice",
    description:
      "The Scribe interviews an author, builds a versioned voice profile and drafts chapters grounded in their own material via pgvector retrieval. A DevAds-owned project, shown as part of the DevAds developer beta.",
  },
  {
    slug: "devads",
    name: "DevAds",
    title: "DevAds Beta Opportunity: how DevAds sponsorships work",
    description:
      "DevAds is sponsorship infrastructure for AI-powered development: server-verified engagement, an idempotent reward ledger, and no source code, prompts, model responses or secrets. Shown as part of the DevAds developer beta.",
  },
] as const;

export const betaVideoCampaignId = (slug: string) => `devads-beta-video-${slug}`;
export const betaVideoOfferId = (slug: string) => `devads-beta-video-offer-${slug}`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST_PATH = path.resolve(HERE, "../../../apps/web/public/beta-creatives/manifest.json");

export function loadCreativeManifest(manifestPath = DEFAULT_MANIFEST_PATH): ManifestEntry[] {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as { creatives?: ManifestEntry[] };
  if (!Array.isArray(parsed.creatives) || parsed.creatives.length === 0) {
    throw new Error(`No rendered creatives in ${manifestPath}; run tools/beta-creatives first`);
  }
  return parsed.creatives;
}

export async function seedBetaVideoCampaigns(
  prisma: PrismaClient,
  siteUrl: string,
  manifest: ManifestEntry[] = loadCreativeManifest()
) {
  const site = siteUrl.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/.test(site)) throw new Error(`seedBetaVideoCampaigns needs an absolute site URL, got "${siteUrl}"`);

  await prisma.advertiser.upsert({
    where: { id: BETA_ADVERTISER_ID },
    update: {},
    create: { id: BETA_ADVERTISER_ID, name: "DevAds", website: site, status: "ACTIVE" },
  });

  for (const product of BETA_VIDEO_PRODUCTS) {
    const creatives = manifest.filter((m) => m.product === product.slug);
    if (creatives.length === 0) throw new Error(`No rendered creatives for ${product.slug}`);
    const campaignId = betaVideoCampaignId(product.slug);
    const offerId = betaVideoOfferId(product.slug);

    await prisma.sponsorshipCampaign.upsert({
      where: { id: campaignId },
      update: {},
      create: {
        id: campaignId,
        advertiserId: BETA_ADVERTISER_ID,
        name: `DevAds Beta Video: ${product.name}`,
        sponsorCategory: null,
        mode: "BETA",
        objective: "PRODUCT_DISCOVERY",
        rewardType: "BETA_CREDITS",
        rewardAmountUnits: 25,
        // Internal accounting charge to DevAds' own advertiser account.
        sponsorChargeCents: 1,
        currency: "USD",
        totalBudgetCents: 50_000,
        dailyBudgetCents: null,
        developerDailyCap: 1,
        developerLifetimeCap: 2,
        frequencyCapPerDay: 3,
        minEngagementSeconds: 15,
        // Video needs a real wait window, which only the editor client reports.
        eligibleClientTypes: ["VS_CODE"],
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: null,
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    await prisma.sponsoredOffer.upsert({
      where: { id: offerId },
      update: {},
      create: {
        id: offerId,
        campaignId,
        title: product.title,
        description: product.description,
        ctaUrl: `${site}/beta/opportunity/${product.slug}?d={displayEventId}`,
        requiredAction: "Open the project page from this offer, spend at least 15 seconds on it, then confirm",
        presentationMode: "VIDEO",
        expiresAt: null,
        status: "ACTIVE",
      },
    });

    // Creatives track the rendered files: re-rendering and re-seeding
    // updates the URL and hash in place for the same length.
    for (const c of creatives) {
      // Preferred source: WebM/VP9, which VS Code webviews (no H.264) can
      // play; fallback: the H.264 MP4 for players without VP9.
      if (!c.webm) throw new Error(`${c.file} has no WebM rendition; run tools/beta-creatives`);
      const data = {
        kind: "VIDEO" as const,
        url: `${site}/beta-creatives/${c.webm.file}`,
        mimeType: c.webm.mimeType,
        fallbackUrl: `${site}/beta-creatives/${c.file}`,
        fallbackMimeType: c.mimeType,
        posterUrl: `${site}/beta-creatives/${c.poster}`,
        width: c.width,
        height: c.height,
        sha256: c.webm.sha256,
      };
      await prisma.offerCreative.upsert({
        where: { offerId_durationSeconds: { offerId, durationSeconds: c.durationSeconds } },
        update: data,
        create: { offerId, durationSeconds: c.durationSeconds, ...data },
      });
    }
  }
}
