-- CreateEnum
CREATE TYPE "AiQueryExecutionStatus" AS ENUM ('succeeded', 'empty', 'failed');

-- CreateEnum
CREATE TYPE "AiQueryRequesterType" AS ENUM ('authenticated_user', 'system');

-- CreateTable
CREATE TABLE "AiQueryTrace" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "requesterType" "AiQueryRequesterType" NOT NULL,
    "requesterId" UUID,
    "httpMethod" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "parametersSnapshot" JSONB NOT NULL,
    "modelId" TEXT,
    "modelVersion" TEXT,
    "methodId" TEXT,
    "methodVersion" TEXT,
    "executionStatus" "AiQueryExecutionStatus" NOT NULL,
    "resultStatus" TEXT,
    "errorCode" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQueryTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiQueryTrace_requestId_idx" ON "AiQueryTrace"("requestId");

-- CreateIndex
CREATE INDEX "AiQueryTrace_createdAt_idx" ON "AiQueryTrace"("createdAt");

-- CreateIndex
CREATE INDEX "AiQueryTrace_endpoint_idx" ON "AiQueryTrace"("endpoint");
