-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "inboundToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Agent_inboundToken_key" ON "Agent"("inboundToken");

