CREATE TABLE "SimulatedSettlement" (
 "transactionId" UUID PRIMARY KEY REFERENCES "EnergyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL CHECK ("status" IN ('REVIEW','DISPUTED','SETTLED')),
 "declaredKwh" DECIMAL(20,2), "acceptedKwh" DECIMAL(20,2),
 "sellerAmountCop" DECIMAL(38,7), "refundAmountCop" DECIMAL(38,7),
 "evidenceReference" TEXT, "disputeReason" TEXT, "resolutionReason" TEXT,
 "events" JSONB NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK ("declaredKwh" IS NULL OR "declaredKwh" >= 0),
 CHECK ("acceptedKwh" IS NULL OR "acceptedKwh" >= 0),
 CHECK ("status" <> 'SETTLED' OR ("acceptedKwh" IS NOT NULL AND "sellerAmountCop" IS NOT NULL AND "refundAmountCop" IS NOT NULL AND "sellerAmountCop" >= 0 AND "refundAmountCop" >= 0))
);
CREATE INDEX "SimulatedSettlement_status_updatedAt_idx" ON "SimulatedSettlement"("status", "updatedAt");
