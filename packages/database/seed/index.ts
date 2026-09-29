import { PrismaClient, UserRole, CampaignStatus, CreativeType } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { seedBetaCampaign } from "./beta.js";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  console.log("Seeding DevAds demo data...");

  // --- Admin -----------------------------------------------------------
  const admin = await prisma.adminUser.upsert({
    where: { email: "admin@devads.dev" },
    update: {},
    create: {
      email: "admin@devads.dev",
      passwordHash: hashPassword("admin12345"),
      displayName: "DevAds Admin",
    },
  });

  // --- Developer ---------------------------------------------------------
  const devUser = await prisma.user.upsert({
    where: { email: "dev@devads.dev" },
    update: {},
    create: {
      email: "dev@devads.dev",
      passwordHash: hashPassword("dev12345"),
      role: UserRole.DEVELOPER,
      developerProfile: {
        create: {
          displayName: "Demo Developer",
          country: "US",
          preferredCategories: ["devtools", "cloud"],
          currency: "USD",
        },
      },
    },
    include: { developerProfile: true },
  });
  const devProfile = devUser.developerProfile!;

  await prisma.privacyConsent.upsert({
    where: { id: `${devUser.id}-seed-consent` },
    update: {},
    create: {
      id: `${devUser.id}-seed-consent`,
      userId: devUser.id,
      telemetryAllowed: true,
      consentVersion: "v1",
    },
  });

  const installation = await prisma.clientInstallation.upsert({
    where: { deviceId: "demo-device-001" },
    update: {},
    create: {
      userId: devUser.id,
      deviceId: "demo-device-001",
      platform: "darwin",
      extensionVersion: "0.1.0",
    },
  });

  // --- Advertiser + billing ------------------------------------------------
  const advertiserUser = await prisma.user.upsert({
    where: { email: "advertiser@devads.dev" },
    update: {},
    create: {
      email: "advertiser@devads.dev",
      passwordHash: hashPassword("advertiser12345"),
      role: UserRole.ADVERTISER,
    },
  });

  const advertiser = await prisma.advertiser.upsert({
    where: { id: "demo-advertiser-acme" },
    update: {},
    create: {
      id: "demo-advertiser-acme",
      name: "Acme Cloud (DEMO)",
      website: "https://example.com/acme-cloud",
      status: "ACTIVE",
    },
  });

  await prisma.advertiserMember.upsert({
    where: { advertiserId_userId: { advertiserId: advertiser.id, userId: advertiserUser.id } },
    update: {},
    create: { advertiserId: advertiser.id, userId: advertiserUser.id, role: "OWNER" },
  });

  await prisma.advertiserBillingAccount.upsert({
    where: { advertiserId: advertiser.id },
    update: {},
    create: {
      advertiserId: advertiser.id,
      provider: "MOCK",
      balanceCents: 500_00,
      currency: "USD",
    },
  });

  // --- Approved demo campaign with image creative -------------------------
  const campaign = await prisma.campaign.upsert({
    where: { id: "demo-campaign-acme-launch" },
    update: {},
    create: {
      id: "demo-campaign-acme-launch",
      advertiserId: advertiser.id,
      name: "Acme Cloud Launch (DEMO)",
      status: CampaignStatus.APPROVED,
      isDemo: true,
      cpmCents: 1500,
      currency: "USD",
      dailyBudgetCents: 10_000,
      totalBudgetCents: 100_000,
      submittedAt: new Date(),
      approvedAt: new Date(),
      targets: {
        create: {
          languages: ["typescript", "javascript"],
          frameworks: ["node", "next.js"],
          runtimes: ["node"],
          platforms: ["darwin", "linux", "win32"],
          countries: ["US", "GB", "NG", "CA"],
          categories: ["devtools", "cloud"],
        },
      },
    },
  });

  const creative = await prisma.campaignCreative.upsert({
    where: { id: "demo-creative-acme-1" },
    update: {},
    create: {
      id: "demo-creative-acme-1",
      campaignId: campaign.id,
      type: CreativeType.IMAGE,
      headline: "Ship faster with Acme Cloud (DEMO)",
      body: "Zero-config deploys for your Node & Next.js apps.",
      ctaLabel: "Try it free",
      ctaUrl: "https://example.com/acme-cloud",
      imageKey: "demo/acme-cloud-card.png",
      mimeType: "image/png",
      sizeBytes: 24_500,
    },
  });

  // A second, DRAFT campaign from a second fictional advertiser, to make
  // the admin approval queue non-empty in demo mode.
  const shipfast = await prisma.advertiser.upsert({
    where: { id: "demo-advertiser-shipfast" },
    update: {},
    create: { id: "demo-advertiser-shipfast", name: "ShipFast (DEMO)", status: "ACTIVE" },
  });
  await prisma.advertiserBillingAccount.upsert({
    where: { advertiserId: shipfast.id },
    update: {},
    create: { advertiserId: shipfast.id, provider: "MOCK", balanceCents: 20_000, currency: "USD" },
  });
  const pendingCampaign = await prisma.campaign.upsert({
    where: { id: "demo-campaign-shipfast-pending" },
    update: {},
    create: {
      id: "demo-campaign-shipfast-pending",
      advertiserId: shipfast.id,
      name: "ShipFast CI Beta (DEMO)",
      status: CampaignStatus.SUBMITTED,
      isDemo: true,
      cpmCents: 1000,
      currency: "USD",
      submittedAt: new Date(),
      creatives: {
        create: {
          type: CreativeType.IMAGE,
          headline: "ShipFast: CI that doesn't make you wait (DEMO)",
          ctaLabel: "Join beta",
          ctaUrl: "https://example.com/shipfast",
          imageKey: "demo/shipfast-card.png",
          mimeType: "image/png",
          sizeBytes: 18_200,
        },
      },
    },
  });

  // --- Impression + event + earnings + spend history ----------------------
  const impressionEventId = "seed-impression-001";
  const impression = await prisma.adImpression.upsert({
    where: { eventId: impressionEventId },
    update: {},
    create: {
      eventId: impressionEventId,
      campaignId: campaign.id,
      creativeId: creative.id,
      developerId: devProfile.id,
      installationId: installation.id,
      command: "npm install",
      cpmCents: campaign.cpmCents,
      currency: campaign.currency,
    },
  });

  await prisma.adEvent.upsert({
    where: { eventId: impressionEventId },
    update: {},
    create: {
      eventId: impressionEventId,
      type: "IMPRESSION",
      campaignId: campaign.id,
      impressionId: impression.id,
      developerId: devProfile.id,
      metadata: { command: "npm install" },
    },
  });

  await prisma.$transaction([
    prisma.developerEarningsLedger.upsert({
      where: { impressionEventId },
      update: {},
      create: {
        developerId: devProfile.id,
        campaignId: campaign.id,
        impressionEventId,
        amountCents: Math.round((campaign.cpmCents / 1000) * 6000 / 10000), // 60% revshare per-impression share
        currency: campaign.currency,
        description: "Impression revenue share (seed)",
      },
    }),
    prisma.campaignSpend.create({
      data: {
        campaignId: campaign.id,
        amountCents: Math.round(campaign.cpmCents / 1000),
        currency: campaign.currency,
        reason: "IMPRESSION",
      },
    }),
  ]);

  await prisma.payout.upsert({
    where: { id: "demo-payout-001" },
    update: {},
    create: {
      id: "demo-payout-001",
      developerId: devProfile.id,
      amountCents: 4500,
      currency: "USD",
      status: "PAID",
      provider: "MOCK",
      providerRef: "mock_payout_demo_1",
      processedAt: new Date(),
    },
  });

  // --- Sponsorship campaigns (the sponsorship loop) -----------------------
  // Two APPROVED campaigns from the same fictional sponsor with different
  // reward types, so the demo shows the loop is not tied to AI credits.
  // They target VS_CODE only: offer selection is global over APPROVED
  // campaigns, and the integration tests (which share this database) use
  // other client types, so an all-clients demo campaign would be served to
  // the tests' developers instead of their own fixtures. Units are integer reward
  // units; sponsorChargeCents is what the sponsor pays per verified
  // completion. The difference between the two is not a fixed ratio: the
  // reward and the charge are configured independently.
  const sponsorshipCampaigns = [
    {
      id: "demo-sponsorship-acme-cloud",
      name: "Acme Cloud Quickstart (DEMO)",
      sponsorCategory: "cloud",
      objective: "TRIAL_ACTIVATION" as const,
      rewardType: "COMPUTE_CREDITS" as const,
      rewardAmountUnits: 500,
      sponsorChargeCents: 300,
      offer: {
        id: "demo-offer-acme-cloud-deploy",
        title: "Deploy the Acme Cloud sample app (DEMO)",
        description: "Fictional demo offer: deploy the sample app and receive compute credits.",
        ctaUrl: "https://example.com/acme-cloud/quickstart",
        requiredAction: "Deploy the sample app",
      },
    },
    {
      id: "demo-sponsorship-acme-ai",
      name: "Acme Model API Trial (DEMO)",
      sponsorCategory: "ai",
      objective: "PRODUCT_DISCOVERY" as const,
      rewardType: "AI_CREDITS" as const,
      rewardAmountUnits: 1000,
      sponsorChargeCents: 150,
      offer: {
        id: "demo-offer-acme-ai-first-call",
        title: "Make your first Acme model API call (DEMO)",
        description: "Fictional demo offer: make one API call and receive AI credits.",
        ctaUrl: "https://example.com/acme-ai/first-call",
        requiredAction: "Make one API call",
      },
    },
  ];
  for (const { offer, ...c } of sponsorshipCampaigns) {
    const data = {
      ...c,
      advertiserId: advertiser.id,
      currency: "USD",
      totalBudgetCents: 25_000_00,
      dailyBudgetCents: null,
      developerDailyCap: 3,
      developerLifetimeCap: 10,
      frequencyCapPerDay: 20,
      eligibleClientTypes: ["VS_CODE" as const],
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: null,
      status: "APPROVED" as const,
      approvedAt: new Date(),
    };
    await prisma.sponsorshipCampaign.upsert({ where: { id: c.id }, update: {}, create: data });
    await prisma.sponsoredOffer.upsert({
      where: { id: offer.id },
      update: {},
      create: { ...offer, campaignId: c.id, status: "ACTIVE" },
    });
  }

  // The DevAds developer beta campaign (production-safe; also `npm run seed:beta`).
  await seedBetaCampaign(prisma, process.env.BETA_SITE_URL ?? "http://localhost:3000");

  console.log("Seed complete:");
  console.log(`  Admin:      admin@devads.dev / admin12345 (id ${admin.id})`);
  console.log(`  Developer:  dev@devads.dev / dev12345`);
  console.log(`  Advertiser: advertiser@devads.dev / advertiser12345`);
  console.log(`  Campaigns:  ${campaign.name} (APPROVED), ${pendingCampaign.name} (SUBMITTED)`);
  console.log(`  Sponsorships: ${sponsorshipCampaigns.map((c) => c.name).join(", ")} (APPROVED)`);
  console.log(`  Beta:       DevAds Developer Beta (BETA, DevAds-funded, 50 BETA_CREDITS)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
