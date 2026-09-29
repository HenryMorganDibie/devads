-- Developer beta: DevAds-funded BETA campaigns on the same sponsorship
-- infrastructure as LIVE sponsor campaigns, OAuth identity, beta membership.

-- CreateEnum
CREATE TYPE "CampaignMode" AS ENUM ('LIVE', 'BETA');

-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('SPONSOR', 'DEVADS_BETA');

-- AlterTable
ALTER TABLE "developer_profiles" ADD COLUMN     "betaJoinedAt" TIMESTAMP(3),
ADD COLUMN     "betaTermsVersion" TEXT;

-- AlterTable
ALTER TABLE "developer_reward_ledger" ADD COLUMN     "campaignMode" "CampaignMode",
ADD COLUMN     "rewardSource" "RewardSource";

-- AlterTable
ALTER TABLE "sponsorship_campaigns" ADD COLUMN     "minEngagementSeconds" INTEGER,
ADD COLUMN     "mode" "CampaignMode" NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authSubject" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_authSubject_key" ON "users"("authSubject");

-- Every reward granted before this migration came from a LIVE sponsor campaign.
UPDATE "developer_reward_ledger"
SET "rewardSource" = 'SPONSOR', "campaignMode" = 'LIVE'
WHERE "entryType" = 'EARNED';

-- A BETA campaign grants BETA_CREDITS and nothing else, and BETA_CREDITS can
-- only come from a BETA campaign: beta rewards can never pose as sponsor-funded.
ALTER TABLE "sponsorship_campaigns"
  ADD CONSTRAINT "sponsorship_campaigns_beta_reward_type_check"
  CHECK (("mode" = 'BETA') = ("rewardType" = 'BETA_CREDITS'));

ALTER TABLE "sponsorship_campaigns"
  ADD CONSTRAINT "sponsorship_campaigns_min_engagement_check"
  CHECK ("minEngagementSeconds" IS NULL OR ("minEngagementSeconds" >= 0 AND "minEngagementSeconds" <= 3600));

-- An earned beta credit is always labelled as DevAds-funded beta, and the
-- DevAds beta source only ever carries beta credits.
ALTER TABLE "developer_reward_ledger"
  ADD CONSTRAINT "developer_reward_ledger_beta_source_check"
  CHECK (
    ("rewardType" <> 'BETA_CREDITS' OR "entryType" <> 'EARNED'
      OR ("rewardSource" = 'DEVADS_BETA' AND "campaignMode" = 'BETA'))
    AND ("rewardSource" IS DISTINCT FROM 'DEVADS_BETA' OR "rewardType" = 'BETA_CREDITS')
  );
