-- Wat Enriqueo per campagne heeft aangeleverd.
--
-- Eén rij per briefingveld. Zonder dit verdween een antwoord in een gesprek en
-- vroeg de volgende agent het opnieuw.
CREATE TABLE "BriefingAntwoord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "veld" TEXT NOT NULL,
    "antwoord" TEXT,
    "gevraagdOp" TIMESTAMP(3),
    "beantwoordOp" TIMESTAMP(3),
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingAntwoord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BriefingAntwoord_threadId_key" ON "BriefingAntwoord"("threadId");
CREATE UNIQUE INDEX "BriefingAntwoord_projectId_veld_key" ON "BriefingAntwoord"("projectId", "veld");
CREATE INDEX "BriefingAntwoord_projectId_idx" ON "BriefingAntwoord"("projectId");

ALTER TABLE "BriefingAntwoord" ADD CONSTRAINT "BriefingAntwoord_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BriefingAntwoord" ADD CONSTRAINT "BriefingAntwoord_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "TelegramThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
