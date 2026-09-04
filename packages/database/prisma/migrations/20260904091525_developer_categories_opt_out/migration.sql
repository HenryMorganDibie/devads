-- AlterTable
ALTER TABLE "developer_profiles" ADD COLUMN     "categoriesOptOut" TEXT[] DEFAULT ARRAY[]::TEXT[];
