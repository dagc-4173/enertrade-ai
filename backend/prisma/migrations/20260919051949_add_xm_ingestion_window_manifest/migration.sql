-- CreateEnum
CREATE TYPE "XmIngestionWindowStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "XmIngestionWindow" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "source" TEXT,
    "requestedFrom" DATE NOT NULL,
    "requestedTo" DATE NOT NULL,
    "receivedFrom" DATE,
    "receivedTo" DATE,
    "rowCount" INTEGER,
    "contentHash" TEXT,
    "status" "XmIngestionWindowStatus" NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "energyDatasetId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "XmIngestionWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XmIngestionWindow_energyDatasetId_key" ON "XmIngestionWindow"("energyDatasetId");

-- CreateIndex
CREATE INDEX "XmIngestionWindow_metric_status_idx" ON "XmIngestionWindow"("metric", "status");

-- CreateIndex
CREATE UNIQUE INDEX "XmIngestionWindow_provider_metric_requestedFrom_requestedTo_key" ON "XmIngestionWindow"("provider", "metric", "requestedFrom", "requestedTo");

-- AddForeignKey
ALTER TABLE "XmIngestionWindow" ADD CONSTRAINT "XmIngestionWindow_energyDatasetId_fkey" FOREIGN KEY ("energyDatasetId") REFERENCES "EnergyDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
