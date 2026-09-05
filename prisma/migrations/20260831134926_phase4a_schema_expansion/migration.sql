/*
  Warnings:

  - You are about to drop the column `aiConfidence` on the `RecoveryAction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FinancialEvent" ADD COLUMN     "disputeId" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "refundId" TEXT;

-- AlterTable
ALTER TABLE "RecoveryAction" DROP COLUMN "aiConfidence",
ADD COLUMN     "recoveryProbability" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RevenueOpportunity" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "leakageCategory" TEXT,
ADD COLUMN     "priorityScore" DOUBLE PRECISION;
