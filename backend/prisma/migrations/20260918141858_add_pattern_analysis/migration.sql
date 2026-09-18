-- CreateEnum
CREATE TYPE "PatternAnalysisStatus" AS ENUM ('completed', 'partial', 'no_results', 'failed');

-- CreateTable
CREATE TABLE "PatternAnalysis" (
    "id" UUID NOT NULL,
    "preparedDatasetId" INTEGER NOT NULL,
    "status" "PatternAnalysisStatus" NOT NULL,
    "dataType" "EnergyDatasetType" NOT NULL,
    "variable" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "methodId" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "resultSnapshot" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatternAnalysis_preparedDatasetId_idx" ON "PatternAnalysis"("preparedDatasetId");

-- CreateIndex
CREATE INDEX "PatternAnalysis_createdAt_idx" ON "PatternAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "PatternAnalysis_dataType_variable_idx" ON "PatternAnalysis"("dataType", "variable");

-- CreateIndex
CREATE INDEX "PatternAnalysis_periodStart_periodEnd_idx" ON "PatternAnalysis"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "PatternAnalysis" ADD CONSTRAINT "PatternAnalysis_preparedDatasetId_fkey" FOREIGN KEY ("preparedDatasetId") REFERENCES "PreparedDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
