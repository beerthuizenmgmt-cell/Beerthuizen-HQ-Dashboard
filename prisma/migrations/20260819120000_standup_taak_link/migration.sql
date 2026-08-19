-- Legt vast welke taak uit welke standup-blokkade komt, zodat "maak hier een
-- taak van" niet bij elke klik opnieuw dezelfde taak aanmaakt.
ALTER TABLE "StandupEntry" ADD COLUMN "taskId" TEXT;

CREATE UNIQUE INDEX "StandupEntry_taskId_key" ON "StandupEntry"("taskId");

ALTER TABLE "StandupEntry" ADD CONSTRAINT "StandupEntry_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
