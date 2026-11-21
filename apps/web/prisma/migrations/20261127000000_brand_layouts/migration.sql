-- CreateTable
CREATE TABLE IF NOT EXISTS "brand_layouts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'blank',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "brand_layouts_slug_key" ON "brand_layouts"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "brand_layouts_position_idx" ON "brand_layouts"("position");
