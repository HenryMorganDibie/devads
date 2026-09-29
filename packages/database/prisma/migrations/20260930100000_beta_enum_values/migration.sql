-- New enum values live in their own migration: Postgres does not allow a
-- value added by ALTER TYPE ... ADD VALUE to be used in the same transaction,
-- and the next migration's CHECK constraints reference them.

-- AlterEnum
ALTER TYPE "DevClientType" ADD VALUE 'WEB';

-- AlterEnum
ALTER TYPE "RewardType" ADD VALUE 'BETA_CREDITS';
