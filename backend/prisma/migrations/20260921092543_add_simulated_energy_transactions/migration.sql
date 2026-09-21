-- CreateEnum
CREATE TYPE "EnergyTransactionStatus" AS ENUM ('PENDING_ACCEPTANCE', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EnergyMarketStatus" ADD VALUE 'FULFILLED';

-- CreateTable
CREATE TABLE "EnergyTransaction" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "demandId" UUID NOT NULL,
    "sellerUserId" UUID NOT NULL,
    "buyerUserId" UUID NOT NULL,
    "quantityKwh" DECIMAL(20,2) NOT NULL,
    "pricePerKwh" DECIMAL(18,5) NOT NULL,
    "totalAmountCop" DECIMAL(38,7) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "EnergyTransactionStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "sellerAcceptedAt" TIMESTAMPTZ(3),
    "buyerAcceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "matchingExecutionId" UUID,

    CONSTRAINT "EnergyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnergyTransaction_offerId_status_idx" ON "EnergyTransaction"("offerId", "status");

-- CreateIndex
CREATE INDEX "EnergyTransaction_demandId_status_idx" ON "EnergyTransaction"("demandId", "status");

-- CreateIndex
CREATE INDEX "EnergyTransaction_sellerUserId_createdAt_idx" ON "EnergyTransaction"("sellerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EnergyTransaction_buyerUserId_createdAt_idx" ON "EnergyTransaction"("buyerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EnergyTransaction_matchingExecutionId_idx" ON "EnergyTransaction"("matchingExecutionId");

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "EnergyOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "EnergyDemand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_matchingExecutionId_fkey" FOREIGN KEY ("matchingExecutionId") REFERENCES "MatchingExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
