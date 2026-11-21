-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "actorId" TEXT,
    "batchId" TEXT,
    "postId" TEXT,
    "jobId" TEXT,
    "progress" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_runs_status_idx" ON "activity_runs"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_runs_createdAt_idx" ON "activity_runs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_runs_batchId_idx" ON "activity_runs"("batchId");

-- AddForeignKey
ALTER TABLE "activity_runs" ADD CONSTRAINT "activity_runs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_runs" ADD CONSTRAINT "activity_runs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
