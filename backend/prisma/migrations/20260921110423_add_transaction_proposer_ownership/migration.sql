-- AlterTable
ALTER TABLE "EnergyTransaction" ADD COLUMN     "proposedByUserId" UUID;

-- CreateIndex
CREATE INDEX "EnergyTransaction_proposedByUserId_createdAt_idx" ON "EnergyTransaction"("proposedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
