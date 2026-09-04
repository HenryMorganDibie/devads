-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "spendCarryMilliCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "developer_profiles" ADD COLUMN     "earningsCarryMilliCents" INTEGER NOT NULL DEFAULT 0;
