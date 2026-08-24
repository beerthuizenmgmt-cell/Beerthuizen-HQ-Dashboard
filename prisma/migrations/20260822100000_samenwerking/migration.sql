-- Samenwerkingsovereenkomsten die wij opstellen.
--
-- Los van Contract: dat is voor contracten die binnenkomen en die we uitpluizen.
-- Dit is de andere kant op — een document dat wij maken.
CREATE TABLE "Samenwerking" (
    "id" TEXT NOT NULL,
    "bedrijf" TEXT NOT NULL,
    "contactpersoon" TEXT,
    "clientId" TEXT,
    "afspraken" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tekst" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "agentId" TEXT,
    "goedgekeurdOp" TIMESTAMP(3),
    "verstuurdOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Samenwerking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Samenwerking_status_createdAt_idx" ON "Samenwerking"("status", "createdAt" DESC);

ALTER TABLE "Samenwerking" ADD CONSTRAINT "Samenwerking_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Samenwerking" ADD CONSTRAINT "Samenwerking_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
