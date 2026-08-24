-- Een gesprek met een klant, zoals het gevoerd is.
--
-- Het bepaalt alles wat erna komt. Stond het alleen in Enriqueo's hoofd, dan
-- moest hij het per agent opnieuw uitleggen — en wat hij vergat, wist niemand.
CREATE TABLE "Klantgesprek" (
    "id" TEXT NOT NULL,
    "bedrijf" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "gevoerdOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aanwezig" TEXT,
    "ruweTekst" TEXT NOT NULL,
    "verwachtingen" TEXT,
    "afspraken" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vervolgstappen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ontbreekt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "verwerktOp" TIMESTAMP(3),
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Klantgesprek_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Klantgesprek_status_gevoerdOp_idx" ON "Klantgesprek"("status", "gevoerdOp" DESC);

ALTER TABLE "Klantgesprek" ADD CONSTRAINT "Klantgesprek_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Klantgesprek" ADD CONSTRAINT "Klantgesprek_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Klantgesprek" ADD CONSTRAINT "Klantgesprek_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
