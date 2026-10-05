-- Offer presentation modes and creatives. Additive only.
-- Every existing offer becomes CARD (the column default), which is exactly
-- how every client presented it before this migration. A VIDEO offer carries
-- one offer_creatives row per length; the server serves the longest one that
-- fits the seconds the client's qualifying interaction reports as available,
-- and records the served creative on the OFFER_DISPLAYED event
-- (sponsorship_events.creativeId, nullable: NULL for CARD offers and for
-- every row recorded before this migration). It coexists with
-- sponsorship_events.interactionKind from the previous migration.

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
    "mimeType" TEXT NOT NULL,
    "fallbackUrl" TEXT,
    "fallbackMimeType" TEXT,
    "posterUrl" TEXT,
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

-- A fallback source is a complete pair and, like the primary, an http(s) URL.
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_fallback_check" CHECK (
  ("fallbackUrl" IS NULL) = ("fallbackMimeType" IS NULL)
  AND ("fallbackUrl" IS NULL OR "fallbackUrl" ~ '^https?://')
  AND ("kind" <> 'VIDEO' OR "fallbackMimeType" IS NULL OR "fallbackMimeType" IN ('video/mp4', 'video/webm'))
);
