-- CreateEnum
CREATE TYPE "Relevance" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "AgentWatch" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "probe" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataHash" TEXT,
    "dataVersion" INTEGER NOT NULL DEFAULT 0,
    "lastDataChangeAt" TIMESTAMP(3),
    "analyzedHash" TEXT,
    "lastAnalyzedAt" TIMESTAMP(3),
    "minIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "nextEligibleAt" TIMESTAMP(3),
    "lastReason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInsight" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "watchId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relevance" "Relevance" NOT NULL DEFAULT 'medium',
    "dataVersion" INTEGER NOT NULL DEFAULT 0,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentWatch_key_key" ON "AgentWatch"("key");

-- CreateIndex
CREATE INDEX "AgentWatch_agentId_idx" ON "AgentWatch"("agentId");

-- CreateIndex
CREATE INDEX "AgentInsight_agentId_createdAt_idx" ON "AgentInsight"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentInsight_reportedAt_idx" ON "AgentInsight"("reportedAt");

-- AddForeignKey
ALTER TABLE "AgentWatch" ADD CONSTRAINT "AgentWatch_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInsight" ADD CONSTRAINT "AgentInsight_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInsight" ADD CONSTRAINT "AgentInsight_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "AgentWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

