/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma as db } from '../../lib/db/prisma';

export async function detectPaymentFailures(merchantId: string, now: Date = new Date(), windowHours: number = 24) {
  const cutoffTime = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  // Find all payment.failed events within the window
  const failedEvents = await db.financialEvent.findMany({
    where: {
      merchantId,
      eventType: 'payment.failed',
      occurredAt: { gte: cutoffTime }
    }
  });

  const results = [];

  for (const event of failedEvents) {
    const paymentId = event.paymentId || event.sourceId;
    if (!paymentId) continue;

    // Check if an opportunity already exists for this paymentId
    const existing = await db.revenueOpportunity.findFirst({
      where: {
        merchantId,
        source: 'PAYMENT_FAILURE',
        sourceId: paymentId
      }
    });

    if (existing) {
      continue;
    }

    // Create a new OPEN opportunity
    const opp = await db.revenueOpportunity.create({
      data: {
        merchantId,
        source: 'PAYMENT_FAILURE',
        sourceId: paymentId,
        amountSubunits: event.amountSubunits || 0,
        currency: event.currency || 'INR',
        reason: 'Payment failure detected',
        status: 'OPEN',
        customerId: event.customerId,
        orderId: event.orderId,
        paymentId: paymentId,
        evidence: event.metadata as any
      }
    });

    results.push(opp);
  }

  return results;
}

