-- CreateTable
CREATE TABLE "MerchantCredential" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKeyId" TEXT NOT NULL,
    "encryptedKeySecret" TEXT NOT NULL,
    "encryptedWebhookSecret" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantCredential_merchantId_idx" ON "MerchantCredential"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCredential_merchantId_provider_key" ON "MerchantCredential"("merchantId", "provider");

-- AddForeignKey
ALTER TABLE "MerchantCredential" ADD CONSTRAINT "MerchantCredential_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

