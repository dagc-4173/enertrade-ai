-- CreateEnum
CREATE TYPE "PriceForecastExecutionStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "PriceForecastConditionsCompleteness" AS ENUM ('complete', 'partial');

-- CreateTable
CREATE TABLE "PriceForecastExecution" (
    "id" UUID NOT NULL,
    "forecastType" TEXT NOT NULL,
    "targetDate" DATE,
    "preparedDatasetId" INTEGER,
    "ruleId" TEXT,
    "ruleVersion" TEXT,
    "ruleType" TEXT,
    "requestPayload" JSONB NOT NULL,
    "inputSnapshot" JSONB,
    "resultPayload" JSONB,
    "status" "PriceForecastExecutionStatus" NOT NULL DEFAULT 'pending',
    "conditionsCompleteness" "PriceForecastConditionsCompleteness",
    "partialReasons" JSONB,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PriceForecastExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceForecastExecution_createdAt_idx" ON "PriceForecastExecution"("createdAt");

-- CreateIndex
CREATE INDEX "PriceForecastExecution_status_idx" ON "PriceForecastExecution"("status");

-- CreateIndex
CREATE INDEX "PriceForecastExecution_targetDate_idx" ON "PriceForecastExecution"("targetDate");

-- CreateIndex
CREATE INDEX "PriceForecastExecution_preparedDatasetId_idx" ON "PriceForecastExecution"("preparedDatasetId");

-- AddForeignKey
ALTER TABLE "PriceForecastExecution" ADD CONSTRAINT "PriceForecastExecution_preparedDatasetId_fkey" FOREIGN KEY ("preparedDatasetId") REFERENCES "PreparedDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
