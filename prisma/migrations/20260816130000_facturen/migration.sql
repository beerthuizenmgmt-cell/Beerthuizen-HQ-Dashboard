
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('concept', 'verzonden', 'deels_betaald', 'betaald', 'oninbaar', 'vervallen_verklaard');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('geen', 'herinnering1_voorbereid', 'herinnering1_verstuurd', 'herinnering2_voorbereid', 'herinnering2_verstuurd', 'gemeld_aan_eigenaar', 'vervolgstap_voorgesteld', 'afgehandeld');

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "issuedOn" TIMESTAMP(3) NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "amountEur" DOUBLE PRECISION NOT NULL,
    "paidAmountEur" DOUBLE PRECISION,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'concept',
    "followUp" "FollowUpStatus" NOT NULL DEFAULT 'geen',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reminder1SentAt" TIMESTAMP(3),
    "reminder2SentAt" TIMESTAMP(3),
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'handmatig',
    "externalId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_status_dueOn_idx" ON "Invoice"("status", "dueOn");

-- CreateIndex
CREATE INDEX "Invoice_dueOn_idx" ON "Invoice"("dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_source_number_key" ON "Invoice"("source", "number");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

