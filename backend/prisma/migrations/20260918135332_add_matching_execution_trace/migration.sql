-- CreateEnum
CREATE TYPE "MatchingExecutionStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "MatchingResultStatus" AS ENUM ('matched', 'partial', 'no_matches');

-- CreateTable
CREATE TABLE "MatchingExecution" (
    "id" UUID NOT NULL,
    "executionStatus" "MatchingExecutionStatus" NOT NULL DEFAULT 'pending',
    "matchingStatus" "MatchingResultStatus",
    "criteriaVersion" TEXT NOT NULL,
    "criteriaSnapshot" JSONB NOT NULL,
    "inputSnapshot" JSONB,
    "resultSnapshot" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MatchingExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchingExecution_createdAt_idx" ON "MatchingExecution"("createdAt");

-- CreateIndex
CREATE INDEX "MatchingExecution_executionStatus_idx" ON "MatchingExecution"("executionStatus");
