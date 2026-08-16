-- CreateEnum
CREATE TYPE "ValueKind" AS ENUM ('hours_saved', 'revenue_opportunity', 'campaign_supported', 'task_automated');

-- CreateEnum
CREATE TYPE "ValueSource" AS ENUM ('agent_estimate', 'user_entered');

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "costKnown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'openrouter',
ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "ModelPrice" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptPerMillion" DOUBLE PRECISION NOT NULL,
    "completionPerMillion" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "ValueKind" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL,
    "source" "ValueSource" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "agentId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelPrice_provider_modelId_key" ON "ModelPrice"("provider", "modelId");

-- CreateIndex
CREATE INDEX "ValueEntry_date_idx" ON "ValueEntry"("date");

-- CreateIndex
CREATE INDEX "ValueEntry_kind_confirmedAt_idx" ON "ValueEntry"("kind", "confirmedAt");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueEntry" ADD CONSTRAINT "ValueEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueEntry" ADD CONSTRAINT "ValueEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

