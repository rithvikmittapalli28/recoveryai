/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { prisma as db } from "../../lib/db/prisma";
import { detectCheckoutAbandonment, AbandonmentCandidate } from "./detector";

export interface AbandonmentRunOptions {
  now?: Date;
  timeoutMinutes?: number;
  severityWeights?: Record<string, number>;
  baseTargetValue?: number;
}

function generateIdempotencyKey(merchantId: string, candidate: AbandonmentCandidate): string {
  const payload = [
    merchantId,
    "CHECKOUT_ABANDONMENT",
    candidate.orderId
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function processCheckoutAbandonments(merchantId: string, options: AbandonmentRunOptions = {}) {
  const now = options.now || new Date();
  const timeoutMinutes = options.timeoutMinutes !== undefined ? options.timeoutMinutes : parseInt(process.env.ABANDONMENT_TIMEOUT_MINUTES || "30", 10);

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new Error("Merchant not found");

  const candidates = await detectCheckoutAbandonment(merchantId, now, timeoutMinutes);

  const results = [];

  for (const candidate of candidates) {
    const fingerprint = generateIdempotencyKey(merchantId, candidate);
    
    // Safety check again just to be perfectly sure
    const existing = await db.revenueOpportunity.findFirst({
      where: {
        merchantId,
        source: "CHECKOUT_ABANDONMENT",
        sourceId: fingerprint
      }
    });

    if (existing) {
      continue;
    }

    const opp = await db.revenueOpportunity.create({
      data: {
        merchantId,
        source: "CHECKOUT_ABANDONMENT",
        sourceId: fingerprint,
        amountSubunits: candidate.evidence.orderAmount,
        currency: candidate.evidence.currency,
        reason: "Likely checkout abandonment candidate",
        status: "OPEN",
        customerId: candidate.customerId,
        orderId: candidate.orderId,
        evidence: candidate.evidence as any
      }
    });

    results.push(opp);
  }

  return results;
}
