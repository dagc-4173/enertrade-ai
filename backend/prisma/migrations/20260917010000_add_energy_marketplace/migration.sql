-- CreateEnum
CREATE TYPE "EnergyMarketStatus" AS ENUM ('ACTIVE');

-- CreateTable
CREATE TABLE "EnergyOffer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quantityKwh" DECIMAL(20,2) NOT NULL,
    "pricePerKwh" DECIMAL(18,5) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "EnergyMarketStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EnergyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyDemand" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "quantityKwh" DECIMAL(20,2) NOT NULL,
    "maxPricePerKwh" DECIMAL(18,5) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "EnergyMarketStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EnergyDemand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnergyOffer_userId_idx" ON "EnergyOffer"("userId");
CREATE INDEX "EnergyOffer_status_idx" ON "EnergyOffer"("status");
CREATE INDEX "EnergyOffer_deliveryDate_idx" ON "EnergyOffer"("deliveryDate");
CREATE INDEX "EnergyDemand_userId_idx" ON "EnergyDemand"("userId");
CREATE INDEX "EnergyDemand_status_idx" ON "EnergyDemand"("status");
CREATE INDEX "EnergyDemand_deliveryDate_idx" ON "EnergyDemand"("deliveryDate");

-- AddForeignKey
ALTER TABLE "EnergyOffer" ADD CONSTRAINT "EnergyOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyDemand" ADD CONSTRAINT "EnergyDemand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
