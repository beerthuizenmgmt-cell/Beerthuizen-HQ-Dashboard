
-- CreateEnum
CREATE TYPE "PortalFormType" AS ENUM ('klantgegevens', 'campagnebriefing', 'contentaanlevering', 'projectinformatie');

-- CreateEnum
CREATE TYPE "PortalStatus" AS ENUM ('aangemaakt', 'verstuurd', 'geopend', 'ingevuld', 'gecontroleerd', 'verwerkt', 'verlopen');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Nederland',
    "kvk" TEXT,
    "vatId" TEXT,
    "invoiceEmail" TEXT,
    "invoiceReference" TEXT,
    "invoiceNotes" TEXT,
    "notes" TEXT,
    "detailsConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "PortalFormType" NOT NULL DEFAULT 'klantgegevens',
    "clientId" TEXT,
    "label" TEXT,
    "status" "PortalStatus" NOT NULL DEFAULT 'aangemaakt',
    "submission" JSONB,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PortalRequest_token_key" ON "PortalRequest"("token");

-- CreateIndex
CREATE INDEX "PortalRequest_status_createdAt_idx" ON "PortalRequest"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalRequest" ADD CONSTRAINT "PortalRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

