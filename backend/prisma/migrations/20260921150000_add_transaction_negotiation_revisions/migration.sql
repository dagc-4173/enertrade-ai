CREATE TABLE "EnergyTransactionRevision" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "proposedByUserId" UUID NOT NULL,
    "quantityKwh" DECIMAL(20,2) NOT NULL,
    "pricePerKwh" DECIMAL(18,5) NOT NULL,
    "totalAmountCop" DECIMAL(38,7) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyTransactionRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnergyTransactionRevision_transactionId_sequence_key" ON "EnergyTransactionRevision"("transactionId", "sequence");
CREATE INDEX "EnergyTransactionRevision_transactionId_createdAt_idx" ON "EnergyTransactionRevision"("transactionId", "createdAt");
CREATE INDEX "EnergyTransactionRevision_proposedByUserId_createdAt_idx" ON "EnergyTransactionRevision"("proposedByUserId", "createdAt");

ALTER TABLE "EnergyTransactionRevision" ADD CONSTRAINT "EnergyTransactionRevision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "EnergyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyTransactionRevision" ADD CONSTRAINT "EnergyTransactionRevision_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;