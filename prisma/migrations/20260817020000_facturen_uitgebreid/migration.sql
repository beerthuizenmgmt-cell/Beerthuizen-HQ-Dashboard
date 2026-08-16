
-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('uitgaand', 'inkomend');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FollowUpStatus" ADD VALUE 'escalatie_voorbereid';
ALTER TYPE "FollowUpStatus" ADD VALUE 'escalatie_overgedragen';

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'goedgekeurd';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientAddress" TEXT,
ADD COLUMN     "clientKvk" TEXT,
ADD COLUMN     "clientVatId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "direction" "InvoiceDirection" NOT NULL DEFAULT 'uitgaand',
ADD COLUMN     "netAmountEur" DOUBLE PRECISION,
ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "vatEur" DOUBLE PRECISION,
ADD COLUMN     "vatRate" DOUBLE PRECISION;

