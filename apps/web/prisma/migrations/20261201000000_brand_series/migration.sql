-- Named recurring series of a brand (Settings, Looks, Series), and the link from a post to its series and its number in it.
-- Additive only: a new table, two nullable columns and an index on posts. Deleting a series leaves its posts (seriesId set to null).
CREATE TABLE IF NOT EXISTS "brand_series" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL DEFAULT 'brand',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "variants" INTEGER[],
    "lookRef" TEXT,
    "mark" TEXT,
    "markField" TEXT NOT NULL DEFAULT 'label',
    "cadence" TEXT NOT NULL,
    "weekday" INTEGER,
    "firstNumber" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "brand_series_brandId_slug_key" ON "brand_series"("brandId", "slug");
CREATE INDEX IF NOT EXISTS "brand_series_brandId_position_idx" ON "brand_series"("brandId", "position");

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "seriesNumber" INTEGER;
CREATE INDEX IF NOT EXISTS "posts_seriesId_idx" ON "posts"("seriesId");

DO $$ BEGIN
  ALTER TABLE "posts" ADD CONSTRAINT "posts_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "brand_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
