-- Preserve legacy rows: no delivery hour is inferred.
CREATE TABLE "EnergyPublication" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "kind" TEXT NOT NULL,
 "deliveryDate" DATE NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EnergyPublication_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EnergyPublication_kind_check" CHECK ("kind" IN ('offer','demand')),
 CONSTRAINT "EnergyPublication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EnergyPublication_userId_kind_deliveryDate_key" ON "EnergyPublication"("userId","kind","deliveryDate");
ALTER TABLE "EnergyOffer" ADD COLUMN "hour" INTEGER, ADD COLUMN "publicationId" UUID;
ALTER TABLE "EnergyDemand" ADD COLUMN "hour" INTEGER, ADD COLUMN "publicationId" UUID;
ALTER TABLE "EnergyTransaction" ADD COLUMN "hour" INTEGER, ADD COLUMN "batchId" UUID;
ALTER TABLE "EnergyOffer" ADD CONSTRAINT "EnergyOffer_hour_check" CHECK ("hour" BETWEEN 0 AND 23), ADD CONSTRAINT "EnergyOffer_hour_parent_check" CHECK (("hour" IS NULL) = ("publicationId" IS NULL)), ADD CONSTRAINT "EnergyOffer_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "EnergyPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyDemand" ADD CONSTRAINT "EnergyDemand_hour_check" CHECK ("hour" BETWEEN 0 AND 23), ADD CONSTRAINT "EnergyDemand_hour_parent_check" CHECK (("hour" IS NULL) = ("publicationId" IS NULL)), ADD CONSTRAINT "EnergyDemand_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "EnergyPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnergyTransaction" ADD CONSTRAINT "EnergyTransaction_hour_check" CHECK ("hour" BETWEEN 0 AND 23);
CREATE UNIQUE INDEX "EnergyOffer_publicationId_hour_key" ON "EnergyOffer"("publicationId","hour");
CREATE UNIQUE INDEX "EnergyDemand_publicationId_hour_key" ON "EnergyDemand"("publicationId","hour");
CREATE INDEX "EnergyOffer_deliveryDate_hour_status_idx" ON "EnergyOffer"("deliveryDate","hour","status");
CREATE INDEX "EnergyDemand_deliveryDate_hour_status_idx" ON "EnergyDemand"("deliveryDate","hour","status");
