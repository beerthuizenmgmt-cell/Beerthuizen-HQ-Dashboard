-- CreateEnum
CREATE TYPE "CreatorSoort" AS ENUM ('eigen', 'via_agency', 'extern');

-- CreateEnum
CREATE TYPE "CreatorStatus" AS ENUM ('kandidaat', 'actief', 'rust', 'niet_inzetten');

-- AlterEnum
ALTER TYPE "PortalFormType" ADD VALUE 'creatorresultaten';

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "soort" "CreatorSoort" NOT NULL DEFAULT 'extern',
    "status" "CreatorStatus" NOT NULL DEFAULT 'kandidaat',
    "instagram" TEXT,
    "tiktok" TEXT,
    "youtube" TEXT,
    "andereKanalen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "niche" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "doelgroep" TEXT,
    "land" TEXT,
    "taal" TEXT,
    "volgersInstagram" INTEGER,
    "volgersTiktok" INTEGER,
    "volgersYoutube" INTEGER,
    "gemiddeldeViews" INTEGER,
    "engagement" DOUBLE PRECISION,
    "cijfersBron" TEXT,
    "cijfersOp" TIMESTAMP(3),
    "prijsindicatieEur" DOUBLE PRECISION,
    "agency" TEXT,
    "email" TEXT,
    "telefoon" TEXT,
    "beoordeling" INTEGER,
    "notities" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorCampagne" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'voorgesteld',
    "motivatie" TEXT,
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vergoedingEur" DOUBLE PRECISION,
    "resultatenGevraagdOp" TIMESTAMP(3),
    "resultatenOntvangenOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorCampagne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorUpload" (
    "id" TEXT NOT NULL,
    "creatorCampagneId" TEXT NOT NULL,
    "requestId" TEXT,
    "kanaal" TEXT NOT NULL DEFAULT 'overig',
    "contentLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bestanden" JSONB,
    "opmerking" TEXT,
    "bereik" INTEGER,
    "impressions" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "ontbreekt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gecontroleerdOp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Creator_status_name_idx" ON "Creator"("status", "name");

-- CreateIndex
CREATE INDEX "Creator_soort_idx" ON "Creator"("soort");

-- CreateIndex
CREATE INDEX "CreatorCampagne_projectId_status_idx" ON "CreatorCampagne"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorCampagne_creatorId_projectId_key" ON "CreatorCampagne"("creatorId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorUpload_requestId_key" ON "CreatorUpload"("requestId");

-- CreateIndex
CREATE INDEX "CreatorUpload_creatorCampagneId_idx" ON "CreatorUpload"("creatorCampagneId");

-- AddForeignKey
ALTER TABLE "CreatorCampagne" ADD CONSTRAINT "CreatorCampagne_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorCampagne" ADD CONSTRAINT "CreatorCampagne_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorUpload" ADD CONSTRAINT "CreatorUpload_creatorCampagneId_fkey" FOREIGN KEY ("creatorCampagneId") REFERENCES "CreatorCampagne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorUpload" ADD CONSTRAINT "CreatorUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PortalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

