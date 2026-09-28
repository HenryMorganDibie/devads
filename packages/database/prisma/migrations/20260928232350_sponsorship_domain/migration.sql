-- CreateEnum
CREATE TYPE "DevClientType" AS ENUM ('VS_CODE', 'CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR', 'OPENCODE', 'AIDER', 'CUSTOM_AGENT', 'LOCAL_AGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DevSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "SponsorshipCampaignStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SponsorshipObjective" AS ENUM ('AWARENESS', 'QUALIFIED_ENGAGEMENT', 'PRODUCT_DISCOVERY', 'TRIAL_ACTIVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('AI_CREDITS', 'API_CREDITS', 'COMPUTE_CREDITS', 'TOOL_CREDITS', 'CASH', 'DISCOUNT', 'SUBSCRIPTION_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "SponsoredOfferStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SponsorshipEventType" AS ENUM ('OFFER_REQUESTED', 'OFFER_DISPLAYED', 'OFFER_SKIPPED', 'OFFER_OPENED', 'OFFER_INTERACTED', 'OFFER_COMPLETED');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RewardLedgerEntryType" AS ENUM ('EARNED', 'REVERSED', 'REDEEMED', 'EXPIRED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "development_sessions" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "clientType" "DevClientType" NOT NULL,
    "clientVersion" TEXT,
    "status" "DevSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "activityCategory" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "development_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_campaigns" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sponsorCategory" TEXT,
    "objective" "SponsorshipObjective" NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "rewardAmountUnits" INTEGER NOT NULL,
    "sponsorChargeCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalBudgetCents" INTEGER,
    "dailyBudgetCents" INTEGER,
    "developerDailyCap" INTEGER,
    "developerLifetimeCap" INTEGER,
    "frequencyCapPerDay" INTEGER,
    "eligibleClientTypes" "DevClientType"[] DEFAULT ARRAY[]::"DevClientType"[],
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "status" "SponsorshipCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "spendCarryMilliCents" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsorship_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_offers" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ctaUrl" TEXT NOT NULL,
    "requiredAction" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" "SponsoredOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "SponsorshipEventType" NOT NULL,
    "offerId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "displayEventId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_campaign_spend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL DEFAULT 'SPONSORSHIP_COMPLETION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_campaign_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_reward_wallets" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "availableUnits" INTEGER NOT NULL DEFAULT 0,
    "pendingUnits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developer_reward_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_reward_ledger" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sponsorshipEventId" TEXT,
    "entryType" "RewardLedgerEntryType" NOT NULL,
    "amountUnits" INTEGER NOT NULL,
    "status" "RewardStatus" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developer_reward_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "development_sessions_developerId_status_idx" ON "development_sessions"("developerId", "status");

-- CreateIndex
CREATE INDEX "sponsorship_campaigns_advertiserId_status_idx" ON "sponsorship_campaigns"("advertiserId", "status");

-- CreateIndex
CREATE INDEX "sponsorship_campaigns_status_idx" ON "sponsorship_campaigns"("status");

-- CreateIndex
CREATE INDEX "sponsored_offers_campaignId_idx" ON "sponsored_offers"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsorship_events_eventId_key" ON "sponsorship_events"("eventId");

-- CreateIndex
CREATE INDEX "sponsorship_events_offerId_developerId_createdAt_idx" ON "sponsorship_events"("offerId", "developerId", "createdAt");

-- CreateIndex
CREATE INDEX "sponsorship_events_campaignId_developerId_createdAt_idx" ON "sponsorship_events"("campaignId", "developerId", "createdAt");

-- CreateIndex
CREATE INDEX "sponsorship_campaign_spend_campaignId_createdAt_idx" ON "sponsorship_campaign_spend"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "developer_reward_wallets_developerId_rewardType_key" ON "developer_reward_wallets"("developerId", "rewardType");

-- CreateIndex
CREATE UNIQUE INDEX "developer_reward_ledger_sponsorshipEventId_key" ON "developer_reward_ledger"("sponsorshipEventId");

-- CreateIndex
CREATE INDEX "developer_reward_ledger_developerId_rewardType_createdAt_idx" ON "developer_reward_ledger"("developerId", "rewardType", "createdAt");

-- CreateIndex
CREATE INDEX "developer_reward_ledger_developerId_campaignId_createdAt_idx" ON "developer_reward_ledger"("developerId", "campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "development_sessions" ADD CONSTRAINT "development_sessions_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_campaigns" ADD CONSTRAINT "sponsorship_campaigns_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "advertisers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_offers" ADD CONSTRAINT "sponsored_offers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsorship_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_events" ADD CONSTRAINT "sponsorship_events_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "sponsored_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_events" ADD CONSTRAINT "sponsorship_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsorship_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_events" ADD CONSTRAINT "sponsorship_events_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_events" ADD CONSTRAINT "sponsorship_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "development_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_campaign_spend" ADD CONSTRAINT "sponsorship_campaign_spend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsorship_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_reward_wallets" ADD CONSTRAINT "developer_reward_wallets_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "developer_reward_ledger_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "developer_reward_ledger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsorship_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "developer_reward_ledger_sponsorshipEventId_fkey" FOREIGN KEY ("sponsorshipEventId") REFERENCES "sponsorship_events"("eventId") ON DELETE SET NULL ON UPDATE CASCADE;
