-- CreateTable
CREATE TABLE "Testrun" (
    "id" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "gestartOp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "afgerondOp" TIMESTAMP(3),
    "opdracht" TEXT NOT NULL,
    "antwoord" TEXT,
    "fout" TEXT,
    "scores" JSONB,
    "eindscore" DOUBLE PRECISION,
    "notities" TEXT,

    CONSTRAINT "Testrun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Testrun_scenario_gestartOp_idx" ON "Testrun"("scenario", "gestartOp" DESC);

