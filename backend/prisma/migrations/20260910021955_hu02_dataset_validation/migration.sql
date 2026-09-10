-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EnergyDatasetStatus" ADD VALUE 'aprobado';
ALTER TYPE "EnergyDatasetStatus" ADD VALUE 'advertencia';
ALTER TYPE "EnergyDatasetStatus" ADD VALUE 'rechazado';

-- AlterTable
ALTER TABLE "EnergyDataset" ADD COLUMN     "validatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "validationReport" JSONB;
