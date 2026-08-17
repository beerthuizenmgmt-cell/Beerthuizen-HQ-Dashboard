-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "creatorId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "brontekst" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "vergoedingEur" DOUBLE PRECISION,
    "betaaltermijn" TEXT,
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageRights" TEXT,
    "exclusiviteit" TEXT,
    "looptijd" TEXT,
    "annulering" TEXT,
    "boetes" TEXT,
    "whitelisting" TEXT,
    "paidUsage" TEXT,
    "contentrechten" TEXT,
    "revisies" TEXT,
    "concurrentiebeperking" TEXT,
    "samenvatting" TEXT,
    "voordelen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nadelen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risicos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aandachtspunten" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "advies" TEXT,
    "onduidelijk" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geanalyseerdOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_status_createdAt_idx" ON "Contract"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

