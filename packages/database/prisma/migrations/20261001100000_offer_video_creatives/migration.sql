-- CreateEnum
CREATE TYPE "PresentationMode" AS ENUM ('CARD', 'VIDEO');

-- CreateEnum
CREATE TYPE "CreativeKind" AS ENUM ('VIDEO');

-- AlterTable
ALTER TABLE "sponsored_offers" ADD COLUMN     "presentationMode" "PresentationMode" NOT NULL DEFAULT 'CARD';

-- AlterTable
ALTER TABLE "sponsorship_events" ADD COLUMN     "creativeId" TEXT;

-- CreateTable
CREATE TABLE "offer_creatives" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" "CreativeKind" NOT NULL,
    "url" TEXT NOT NULL,
    "posterUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_creatives_offerId_durationSeconds_key" ON "offer_creatives"("offerId", "durationSeconds");

-- AddForeignKey
ALTER TABLE "sponsorship_events" ADD CONSTRAINT "sponsorship_events_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "offer_creatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "sponsored_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A creative is a real, bounded asset: positive dimensions, a duration a
-- client can actually present, and an https/http URL.
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_duration_check" CHECK ("durationSeconds" BETWEEN 1 AND 600);
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_dimensions_check" CHECK ("width" > 0 AND "height" > 0);
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_url_check" CHECK ("url" ~ '^https?://' AND ("posterUrl" IS NULL OR "posterUrl" ~ '^https?://'));
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_video_mime_check" CHECK ("kind" <> 'VIDEO' OR "mimeType" IN ('video/mp4', 'video/webm'));
