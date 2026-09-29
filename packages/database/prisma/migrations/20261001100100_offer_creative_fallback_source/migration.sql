-- AlterTable
ALTER TABLE "offer_creatives" ADD COLUMN     "fallbackMimeType" TEXT,
ADD COLUMN     "fallbackUrl" TEXT;

-- A fallback source is a complete pair and, like the primary, an http(s) URL.
ALTER TABLE "offer_creatives" ADD CONSTRAINT "offer_creatives_fallback_check" CHECK (
  ("fallbackUrl" IS NULL) = ("fallbackMimeType" IS NULL)
  AND ("fallbackUrl" IS NULL OR "fallbackUrl" ~ '^https?://')
  AND ("kind" <> 'VIDEO' OR "fallbackMimeType" IS NULL OR "fallbackMimeType" IN ('video/mp4', 'video/webm'))
);
