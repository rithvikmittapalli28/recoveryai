/*
  Warnings:

  - The `status` column on the `RevenueOpportunity` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'ANALYZED', 'ACTION_PROPOSED', 'AWAITING_APPROVAL', 'ACTION_EXECUTED', 'RECOVERED', 'DECLINED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "RevenueOpportunity" DROP COLUMN "status",
ADD COLUMN     "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" TEXT NOT NULL,
    "revenueOpportunityId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "razorpayPaymentLinkId" TEXT,
    "shortUrl" TEXT,
    "amountSubunits" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "aiReasoning" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "expectedRecoveryValue" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryAction_revenueOpportunityId_idx" ON "RecoveryAction"("revenueOpportunityId");

-- CreateIndex
CREATE INDEX "RevenueOpportunity_merchantId_status_idx" ON "RevenueOpportunity"("merchantId", "status");

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_revenueOpportunityId_fkey" FOREIGN KEY ("revenueOpportunityId") REFERENCES "RevenueOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
