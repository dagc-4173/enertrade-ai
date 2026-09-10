-- CreateEnum
CREATE TYPE "EnergyDatasetType" AS ENUM ('generacion', 'consumo', 'oferta', 'demanda', 'precios', 'transacciones_simuladas');

-- CreateEnum
CREATE TYPE "EnergyDatasetStatus" AS ENUM ('recibido');

-- CreateTable
CREATE TABLE "EnergyDataset" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "dataType" "EnergyDatasetType" NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EnergyDatasetStatus" NOT NULL DEFAULT 'recibido',
    "content" JSONB NOT NULL,
    "pendingOptionalFields" JSONB NOT NULL,

    CONSTRAINT "EnergyDataset_pkey" PRIMARY KEY ("id")
);
