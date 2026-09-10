-- CreateTable
CREATE TABLE "PreparedDataset" (
    "id" SERIAL NOT NULL,
    "sourceDatasetId" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileVersion" TEXT NOT NULL,
    "preparedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRulesetId" TEXT NOT NULL,
    "sourceRulesetVersion" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "transformations" JSONB NOT NULL,

    CONSTRAINT "PreparedDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreparedDataset_sourceDatasetId_profileId_profileVersion_key" ON "PreparedDataset"("sourceDatasetId", "profileId", "profileVersion");

-- AddForeignKey
ALTER TABLE "PreparedDataset" ADD CONSTRAINT "PreparedDataset_sourceDatasetId_fkey" FOREIGN KEY ("sourceDatasetId") REFERENCES "EnergyDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
