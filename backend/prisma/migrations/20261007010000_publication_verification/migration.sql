CREATE TABLE "SimulationCapacityProfile" (
 "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL, "kind" TEXT NOT NULL,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "source" TEXT NOT NULL DEFAULT 'USER_DECLARED_SIMULATION',
 "limits" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SimulationCapacityProfile_kind_check" CHECK ("kind" IN ('offer','demand')),
 CONSTRAINT "SimulationCapacityProfile_source_check" CHECK ("source" = 'USER_DECLARED_SIMULATION'),
 CONSTRAINT "SimulationCapacityProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SimulationCapacityProfile_userId_kind_version_key" ON "SimulationCapacityProfile"("userId","kind","version");
CREATE TABLE "PublicationVerification" (
 "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL, "offerId" UUID, "demandId" UUID, "profileId" UUID,
 "ruleId" TEXT NOT NULL, "ruleVersion" TEXT NOT NULL, "resultStatus" TEXT NOT NULL,
 "inputSnapshot" JSONB NOT NULL, "resultSnapshot" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PublicationVerification_target_check" CHECK (("offerId" IS NULL) <> ("demandId" IS NULL)),
 CONSTRAINT "PublicationVerification_status_check" CHECK ("resultStatus" IN ('APPROVED','REJECTED','NO_REFERENCE')),
 CONSTRAINT "PublicationVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PublicationVerification_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "EnergyOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PublicationVerification_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "EnergyDemand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PublicationVerification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "SimulationCapacityProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PublicationVerification_offerId_createdAt_idx" ON "PublicationVerification"("offerId","createdAt");
CREATE INDEX "PublicationVerification_demandId_createdAt_idx" ON "PublicationVerification"("demandId","createdAt");
CREATE INDEX "PublicationVerification_userId_createdAt_idx" ON "PublicationVerification"("userId","createdAt");
