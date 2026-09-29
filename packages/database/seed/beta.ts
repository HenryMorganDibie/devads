import { PrismaClient } from "@prisma/client";
import { seedBetaVideoCampaigns } from "./betaVideo.js";

/**
 * The DevAds developer beta campaign. Safe to run against production: it
 * creates no users or credentials, only DevAds' own advertiser record, one
 * BETA campaign and its offer, and it never overwrites an existing row (so
 * an operator's later edits in the admin dashboard or database survive).
 *
 * DevAds funds this campaign itself. It is not presented as, and must never
 * be presented as, an external sponsor. It runs on the same campaign, offer,
 * verification, ledger and wallet infrastructure as LIVE sponsor campaigns;
 * only `mode: BETA` and the BETA_CREDITS reward type differ.
 */
import { BETA_ADVERTISER_ID, BETA_CAMPAIGN_ID, BETA_OFFER_ID } from "./betaIds.js";

export { BETA_ADVERTISER_ID, BETA_CAMPAIGN_ID, BETA_OFFER_ID };

export async function seedBetaCampaign(prisma: PrismaClient, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/.test(site)) throw new Error(`seedBetaCampaign needs an absolute site URL, got "${siteUrl}"`);

  await prisma.advertiser.upsert({
    where: { id: BETA_ADVERTISER_ID },
    update: {},
    create: { id: BETA_ADVERTISER_ID, name: "DevAds", website: site, status: "ACTIVE" },
  });

  await prisma.sponsorshipCampaign.upsert({
    where: { id: BETA_CAMPAIGN_ID },
    update: {},
    create: {
      id: BETA_CAMPAIGN_ID,
      advertiserId: BETA_ADVERTISER_ID,
      name: "DevAds Developer Beta",
      sponsorCategory: null,
      mode: "BETA",
      objective: "PRODUCT_DISCOVERY",
      rewardType: "BETA_CREDITS",
      rewardAmountUnits: 50,
      // An internal accounting charge to DevAds' own advertiser account, so
      // beta usage is measured and capped by the same budget machinery as a
      // sponsor campaign. No external party is charged.
      sponsorChargeCents: 1,
      currency: "USD",
      totalBudgetCents: 1_000_00,
      dailyBudgetCents: null,
      developerDailyCap: 1,
      developerLifetimeCap: 3,
      frequencyCapPerDay: 5,
      // The developer must open the walkthrough and stay on it this long.
      minEngagementSeconds: 15,
      // The web app and the VS Code extension are the two first-party clients.
      eligibleClientTypes: ["WEB", "VS_CODE"],
      startDate: new Date("2026-09-01T00:00:00Z"),
      endDate: null,
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });

  await prisma.sponsoredOffer.upsert({
    where: { id: BETA_OFFER_ID },
    update: {},
    create: {
      id: BETA_OFFER_ID,
      campaignId: BETA_CAMPAIGN_ID,
      title: "DevAds Beta Opportunity: see how sponsored developer experiences work",
      description:
        "Read a short walkthrough of how DevAds verifies a sponsored interaction, then confirm it to receive 50 Beta Credits. Beta Credits are DevAds-funded beta rewards: they are not cash and cannot be redeemed.",
      ctaUrl: `${site}/beta/opportunity`,
      requiredAction: "Open the walkthrough, spend at least 15 seconds on it, then confirm completion",
      expiresAt: null,
      status: "ACTIVE",
    },
  });
}

// `npm run seed:beta -w @devads/database` (also run by the API build).
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const prisma = new PrismaClient();
  // Empty values (as in .env.example) count as unset.
  const site =
    [process.env.BETA_SITE_URL, process.env.NEXT_PUBLIC_SITE_URL].map((v) => v?.trim()).find(Boolean) ??
    "https://devads-app.vercel.app";
  seedBetaCampaign(prisma, site)
    .then(() => seedBetaVideoCampaigns(prisma, site))
    .then(() => console.log(`DevAds beta campaigns ready (${BETA_CAMPAIGN_ID} + first-party video campaigns, site ${site})`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
