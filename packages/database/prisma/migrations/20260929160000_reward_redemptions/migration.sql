-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "developer_reward_ledger" ADD COLUMN     "redemptionId" TEXT,
ALTER COLUMN "campaignId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "rewardType" "RewardType" NOT NULL,
    "amountUnits" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_redemptions_developerId_createdAt_idx" ON "reward_redemptions"("developerId", "createdAt");

-- CreateIndex
CREATE INDEX "reward_redemptions_status_createdAt_idx" ON "reward_redemptions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reward_redemptions_developerId_idempotencyKey_key" ON "reward_redemptions"("developerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "developer_reward_ledger_redemptionId_entryType_key" ON "developer_reward_ledger"("redemptionId", "entryType");

-- AddForeignKey
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "developer_reward_ledger_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "reward_redemptions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "developer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules the application also enforces (defense in depth, same
-- approach as 20260928232400_sponsorship_check_constraints).
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_amount_positive" CHECK ("amountUnits" > 0);
-- An earned reward always belongs to the campaign that paid for it.
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "reward_ledger_earned_has_campaign" CHECK ("entryType" <> 'EARNED' OR "campaignId" IS NOT NULL);
-- A redemption debit always belongs to the redemption that caused it.
ALTER TABLE "developer_reward_ledger" ADD CONSTRAINT "reward_ledger_redeemed_has_redemption" CHECK ("entryType" <> 'REDEEMED' OR "redemptionId" IS NOT NULL);
