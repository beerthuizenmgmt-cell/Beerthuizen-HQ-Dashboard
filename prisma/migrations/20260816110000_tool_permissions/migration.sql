
-- CreateEnum
CREATE TYPE "ToolPermission" AS ENUM ('lezen', 'voorstellen', 'schrijven');

-- AlterTable
ALTER TABLE "AgentTool" ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "permission" "ToolPermission" NOT NULL DEFAULT 'lezen',
ADD COLUMN     "useCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ToolIntegration" (
    "id" TEXT NOT NULL,
    "toolKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyCostEur" DOUBLE PRECISION,
    "notes" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolIntegration_toolKey_key" ON "ToolIntegration"("toolKey");

