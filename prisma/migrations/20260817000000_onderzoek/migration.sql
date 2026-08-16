
-- CreateEnum
CREATE TYPE "ResearchSubject" AS ENUM ('markt', 'merk', 'creator', 'concurrent', 'trend', 'doelgroep', 'prospect', 'overig');

-- CreateTable
CREATE TABLE "ResearchEntry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "subject" "ResearchSubject" NOT NULL DEFAULT 'overig',
    "about" TEXT,
    "findings" TEXT NOT NULL,
    "insight" TEXT,
    "conclusion" TEXT,
    "risks" TEXT,
    "opportunities" TEXT,
    "advice" TEXT,
    "sources" JSONB,
    "staleAfter" TIMESTAMP(3),
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchEntry_subject_createdAt_idx" ON "ResearchEntry"("subject", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ResearchEntry_createdAt_idx" ON "ResearchEntry"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ResearchEntry" ADD CONSTRAINT "ResearchEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

