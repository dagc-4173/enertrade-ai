CREATE TYPE "SimulatedPaymentStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TABLE "SimulatedPaymentAttempt" (
 "id" UUID NOT NULL PRIMARY KEY, "transactionId" UUID NOT NULL, "payerUserId" UUID NOT NULL, "requestKey" UUID NOT NULL,
 "scenario" "SimulatedPaymentStatus" NOT NULL, "status" "SimulatedPaymentStatus" NOT NULL,
 "amountCop" DECIMAL(38,7) NOT NULL CHECK ("amountCop" > 0), "currency" TEXT NOT NULL DEFAULT 'COP' CHECK ("currency" = 'COP'),
 "providerId" TEXT NOT NULL DEFAULT 'internal-simulator', "providerVersion" TEXT NOT NULL DEFAULT '1.0.0',
 "contractSnapshot" JSONB NOT NULL, "receiptReference" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMPTZ(3),
 CONSTRAINT "SimulatedPaymentAttempt_receipt_check" CHECK (("status" = 'APPROVED') = ("receiptReference" IS NOT NULL)),
 CONSTRAINT "SimulatedPaymentAttempt_resolution_check" CHECK (("status" = 'PENDING') = ("resolvedAt" IS NULL)),
 CONSTRAINT "SimulatedPaymentAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "EnergyTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SimulatedPaymentAttempt_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SimulatedPaymentAttempt_transactionId_requestKey_key" ON "SimulatedPaymentAttempt"("transactionId","requestKey");
CREATE UNIQUE INDEX "SimulatedPaymentAttempt_receiptReference_key" ON "SimulatedPaymentAttempt"("receiptReference");
CREATE INDEX "SimulatedPaymentAttempt_transactionId_createdAt_idx" ON "SimulatedPaymentAttempt"("transactionId","createdAt");
CREATE UNIQUE INDEX "SimulatedPaymentAttempt_one_approved" ON "SimulatedPaymentAttempt"("transactionId") WHERE "status" = 'APPROVED';
CREATE UNIQUE INDEX "SimulatedPaymentAttempt_one_pending" ON "SimulatedPaymentAttempt"("transactionId") WHERE "status" = 'PENDING';
