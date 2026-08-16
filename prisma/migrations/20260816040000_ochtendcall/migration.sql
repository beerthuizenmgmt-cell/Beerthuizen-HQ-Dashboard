-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "callEndedAt" TIMESTAMP(3),
ADD COLUMN     "callStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StandupEntry" ADD COLUMN     "questions" TEXT;

-- CreateTable
CREATE TABLE "MeetingQuestion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveryError" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingQuestion_meetingId_sortOrder_idx" ON "MeetingQuestion"("meetingId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MeetingQuestion" ADD CONSTRAINT "MeetingQuestion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingQuestion" ADD CONSTRAINT "MeetingQuestion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

