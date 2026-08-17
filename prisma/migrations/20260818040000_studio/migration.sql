-- CreateEnum
CREATE TYPE "BoekingStatus" AS ENUM ('aangevraagd', 'voorgesteld', 'bevestigd', 'geannuleerd', 'afgerond');

-- CreateTable
CREATE TABLE "Studioruimte" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "soort" TEXT NOT NULL DEFAULT 'fotostudio',
    "dagtariefEur" DOUBLE PRECISION,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "notities" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Studioruimte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Studioboeking" (
    "id" TEXT NOT NULL,
    "ruimteId" TEXT NOT NULL,
    "clientId" TEXT,
    "contact" TEXT,
    "dag" TIMESTAMP(3) NOT NULL,
    "dagdeel" TEXT NOT NULL DEFAULT 'hele dag',
    "status" "BoekingStatus" NOT NULL DEFAULT 'aangevraagd',
    "doel" TEXT,
    "tariefEur" DOUBLE PRECISION,
    "annuleringsreden" TEXT,
    "verplaatstVanaf" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Studioboeking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Studioruimte_naam_key" ON "Studioruimte"("naam");

-- CreateIndex
CREATE UNIQUE INDEX "Studioboeking_invoiceId_key" ON "Studioboeking"("invoiceId");

-- CreateIndex
CREATE INDEX "Studioboeking_ruimteId_dag_idx" ON "Studioboeking"("ruimteId", "dag");

-- CreateIndex
CREATE INDEX "Studioboeking_status_dag_idx" ON "Studioboeking"("status", "dag");

-- AddForeignKey
ALTER TABLE "Studioboeking" ADD CONSTRAINT "Studioboeking_ruimteId_fkey" FOREIGN KEY ("ruimteId") REFERENCES "Studioruimte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Studioboeking" ADD CONSTRAINT "Studioboeking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Studioboeking" ADD CONSTRAINT "Studioboeking_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Twee bevestigde boekingen op dezelfde ruimte, dezelfde dag en hetzelfde
-- dagdeel mogen niet bestaan. Een gedeeltelijke index, want geannuleerde en
-- aangevraagde boekingen mogen wél naast elkaar staan: pas bij bevestigen
-- claim je de ruimte.
--
-- Bewust in de database en niet alleen in de code: drukken twee mensen
-- tegelijk op bevestigen, dan houdt een controle in de applicatie dat niet
-- tegen en deze wel.
CREATE UNIQUE INDEX "Studioboeking_bezet_uniek"
  ON "Studioboeking" ("ruimteId", "dag", "dagdeel")
  WHERE "status" = 'bevestigd';
