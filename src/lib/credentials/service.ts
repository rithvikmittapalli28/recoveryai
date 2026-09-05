import { prisma } from '../db/prisma';
import { decryptCredential } from './encryption';
import type { RazorpayConfig } from '../config/env';
import { getRazorpayConfig } from '../config/env';

export async function getRazorpayConfigForMerchant(merchantId: string): Promise<RazorpayConfig> {
  const credential = await prisma.merchantCredential.findUnique({
    where: {
      merchantId_provider: {
        merchantId,
        provider: 'RAZORPAY',
      },
    },
  });

  if (!credential) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Production Security Guard: No Razorpay credentials configured for merchant ${merchantId}. Global fallback is disabled in production.`);
    }

    // Fallback to global config for migration/testing in non-production environments
    const globalConfig = getRazorpayConfig();
    if (globalConfig.ok) {
      return globalConfig.value;
    }
    throw new Error(`No Razorpay credentials found for merchant ${merchantId}, and no global fallback.`);
  }

  return {
    keyId: decryptCredential(credential.encryptedKeyId),
    keySecret: decryptCredential(credential.encryptedKeySecret),
    webhookSecret: credential.encryptedWebhookSecret 
      ? decryptCredential(credential.encryptedWebhookSecret) 
      : undefined,
  };
}
