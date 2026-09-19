-- CreateTable
CREATE TABLE "XmConsolidatedDataset" (
    "id" SERIAL NOT NULL,
    "metric" TEXT NOT NULL,
    "requestedFrom" DATE NOT NULL,
    "requestedTo" DATE NOT NULL,
    "contentHash" TEXT NOT NULL,
    "energyDatasetId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XmConsolidatedDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XmConsolidatedDatasetSource" (
    "consolidatedDatasetId" INTEGER NOT NULL,
    "xmIngestionWindowId" INTEGER NOT NULL,

    CONSTRAINT "XmConsolidatedDatasetSource_pkey" PRIMARY KEY ("consolidatedDatasetId","xmIngestionWindowId")
);

-- CreateIndex
CREATE UNIQUE INDEX "XmConsolidatedDataset_energyDatasetId_key" ON "XmConsolidatedDataset"("energyDatasetId");

-- CreateIndex
CREATE INDEX "XmConsolidatedDataset_metric_requestedFrom_requestedTo_idx" ON "XmConsolidatedDataset"("metric", "requestedFrom", "requestedTo");

-- CreateIndex
CREATE UNIQUE INDEX "XmConsolidatedDataset_metric_requestedFrom_requestedTo_cont_key" ON "XmConsolidatedDataset"("metric", "requestedFrom", "requestedTo", "contentHash");

-- CreateIndex
CREATE INDEX "XmConsolidatedDatasetSource_xmIngestionWindowId_idx" ON "XmConsolidatedDatasetSource"("xmIngestionWindowId");

-- AddForeignKey
ALTER TABLE "XmConsolidatedDataset" ADD CONSTRAINT "XmConsolidatedDataset_energyDatasetId_fkey" FOREIGN KEY ("energyDatasetId") REFERENCES "EnergyDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmConsolidatedDatasetSource" ADD CONSTRAINT "XmConsolidatedDatasetSource_consolidatedDatasetId_fkey" FOREIGN KEY ("consolidatedDatasetId") REFERENCES "XmConsolidatedDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmConsolidatedDatasetSource" ADD CONSTRAINT "XmConsolidatedDatasetSource_xmIngestionWindowId_fkey" FOREIGN KEY ("xmIngestionWindowId") REFERENCES "XmIngestionWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
