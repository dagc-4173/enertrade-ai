CREATE TABLE "ForecastHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" DATE NOT NULL,
    "originDate" DATE NOT NULL,
    "series" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "forecastSha256" CHAR(64) NOT NULL,
    "forecastSnapshot" JSONB NOT NULL,
    "evaluationSnapshot" JSONB,
    "evaluatedAt" TIMESTAMPTZ(3),
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastCheckStatus" TEXT,
    CONSTRAINT "ForecastHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ForecastHistory_userId_requestId_key" ON "ForecastHistory"("userId", "requestId");
CREATE INDEX "ForecastHistory_userId_createdAt_id_idx" ON "ForecastHistory"("userId", "createdAt", "id");
CREATE INDEX "ForecastHistory_userId_targetDate_idx" ON "ForecastHistory"("userId", "targetDate");
ALTER TABLE "ForecastHistory" ADD CONSTRAINT "ForecastHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
