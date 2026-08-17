-- CreateEnum
CREATE TYPE "VoorstelSoort" AS ENUM ('influencer', 'event', 'advertising', 'studio', 'overig');

-- CreateEnum
CREATE TYPE "VoorstelStatus" AS ENUM ('opbouw', 'in_controle', 'klaar_voor_akkoord', 'goedgekeurd', 'afgewezen', 'verzonden');

-- CreateTable
CREATE TABLE "Voorstel" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "soort" "VoorstelSoort" NOT NULL DEFAULT 'influencer',
    "status" "VoorstelStatus" NOT NULL DEFAULT 'opbouw',
    "clientId" TEXT,
    "projectId" TEXT,
    "ontbreekt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "controlepunten" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gecontroleerdOp" TIMESTAMP(3),
    "samenvattingWat" TEXT,
    "samenvattingInvestering" TEXT,
    "samenvattingImpact" TEXT,
    "samenvattingAandacht" TEXT,
    "samenvattingBeslissing" TEXT,
    "besluitOp" TIMESTAMP(3),
    "besluitDoor" TEXT,
    "besluitReden" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voorstel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoorstelSectie" (
    "id" TEXT NOT NULL,
    "voorstelId" TEXT NOT NULL,
    "sleutel" TEXT NOT NULL,
    "agentId" TEXT,
    "inhoud" TEXT,
    "bron" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opmerking" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoorstelSectie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voorstel_status_createdAt_idx" ON "Voorstel"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VoorstelSectie_voorstelId_sortOrder_idx" ON "VoorstelSectie"("voorstelId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VoorstelSectie_voorstelId_sleutel_key" ON "VoorstelSectie"("voorstelId", "sleutel");

-- AddForeignKey
ALTER TABLE "Voorstel" ADD CONSTRAINT "Voorstel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voorstel" ADD CONSTRAINT "Voorstel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoorstelSectie" ADD CONSTRAINT "VoorstelSectie_voorstelId_fkey" FOREIGN KEY ("voorstelId") REFERENCES "Voorstel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoorstelSectie" ADD CONSTRAINT "VoorstelSectie_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

