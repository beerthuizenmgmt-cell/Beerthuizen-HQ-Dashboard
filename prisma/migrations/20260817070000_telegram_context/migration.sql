
-- CreateTable
CREATE TABLE "TelegramThread" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "question" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "clientId" TEXT,
    "telegramMessageId" INTEGER,
    "answer" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "TelegramThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramThread_answeredAt_askedAt_idx" ON "TelegramThread"("answeredAt", "askedAt" DESC);

-- AddForeignKey
ALTER TABLE "TelegramThread" ADD CONSTRAINT "TelegramThread_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramThread" ADD CONSTRAINT "TelegramThread_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramThread" ADD CONSTRAINT "TelegramThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramThread" ADD CONSTRAINT "TelegramThread_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

