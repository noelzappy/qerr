-- AlterTable
ALTER TABLE "brand_profiles" ADD COLUMN IF NOT EXISTS "activeLookRef" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "brand_looks" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL DEFAULT 'brand',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "origin" TEXT NOT NULL,
    "engineSchema" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "gate" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_looks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "brand_look_compositions" (
    "id" TEXT NOT NULL,
    "lookId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL DEFAULT 'brand',
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "draft" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "gate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_look_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "brand_looks_brandId_slug_key" ON "brand_looks"("brandId", "slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "brand_looks_brandId_position_idx" ON "brand_looks"("brandId", "position");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "brand_look_compositions_lookId_kind_position_key" ON "brand_look_compositions"("lookId", "kind", "position");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "brand_look_compositions_brandId_idx" ON "brand_look_compositions"("brandId");

-- AddForeignKey
ALTER TABLE "brand_look_compositions" DROP CONSTRAINT IF EXISTS "brand_look_compositions_lookId_fkey";
ALTER TABLE "brand_look_compositions" ADD CONSTRAINT "brand_look_compositions_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "brand_looks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
