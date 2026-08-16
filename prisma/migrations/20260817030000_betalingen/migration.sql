
-- CreateTable
CREATE TABLE "IncomingPayment" (
    "id" TEXT NOT NULL,
    "amountEur" DOUBLE PRECISION NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "counterparty" TEXT,
    "source" TEXT NOT NULL DEFAULT 'handmatig',
    "externalId" TEXT,
    "invoiceId" TEXT,
    "matchConfidence" TEXT NOT NULL DEFAULT 'geen',
    "matchReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingPayment_confirmedAt_createdAt_idx" ON "IncomingPayment"("confirmedAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingPayment_source_externalId_key" ON "IncomingPayment"("source", "externalId");

-- AddForeignKey
ALTER TABLE "IncomingPayment" ADD CONSTRAINT "IncomingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

