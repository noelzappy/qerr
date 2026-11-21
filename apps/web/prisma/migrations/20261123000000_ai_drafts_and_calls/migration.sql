-- AlterTable
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "aiDraft" JSONB;

-- AlterTable
ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "inputPricePerMTok" DOUBLE PRECISION;
ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "outputPricePerMTok" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_calls" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL DEFAULT 'llm',
    "task" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "runId" TEXT,
    "batchId" TEXT,
    "actorId" TEXT,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_calls_at_idx" ON "ai_calls"("at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_calls_batchId_idx" ON "ai_calls"("batchId");
