-- CreateTable
CREATE TABLE IF NOT EXISTS "brand_profiles" (
    "id" TEXT NOT NULL DEFAULT 'brand',
    "settings" JSONB NOT NULL,
    "advanced" JSONB NOT NULL DEFAULT '{}',
    "map" JSONB,
    "logoFullKey" TEXT,
    "logoFullWidth" INTEGER,
    "logoFullHeight" INTEGER,
    "logoMarkKey" TEXT,
    "fontKey" TEXT,
    "fontFamily" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "design_references" (
    "id" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "analysis" JSONB,
    "brief" TEXT,
    "error" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "design_references_createdAt_idx" ON "design_references"("createdAt");
