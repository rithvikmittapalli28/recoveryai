import { prisma as db } from "../../lib/db/prisma";

export interface CheckoutAbandonmentEvidence {
  orderId: string;
  orderAgeMinutes: number;
  orderAmount: number;
  currency: string;
  paymentAttemptCount: number;
  successfulPaymentCount: number;
  failedPaymentCount: number;
  pendingPaymentCount: number;
  customerHistory: {
    lifetimeSuccessfulPayments: number;
    lifetimeFailedPayments: number;
    averageTransactionValue: number;
    mostRecentSuccessDate: string | null;
  } | null;
  previousRecoveryActions: number;
  eligibilityReason: string;
}

export interface AbandonmentCandidate {
  orderId: string;
  merchantId: string;
  customerId: string | null;
  evidence: CheckoutAbandonmentEvidence;
}

export async function detectCheckoutAbandonment(
  merchantId: string,
  now: Date = new Date(),
  timeoutMinutes: number = parseInt(process.env.ABANDONMENT_TIMEOUT_MINUTES || "30", 10)
): Promise<AbandonmentCandidate[]> {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const cutoffTime = new Date(now.getTime() - timeoutMs);

  // Find all unpaid orders older than the timeout
  const candidateOrders = await db.order.findMany({
    where: {
      merchantId,
      status: { not: "paid" },
      createdAt: { lte: cutoffTime }
    },
    include: {
      payments: true,
      customer: true
    }
  });

  const activeOppStatuses = [
    "OPEN", "ANALYZED", "ACTION_PROPOSED", "AWAITING_APPROVAL", "ACTION_EXECUTED"
  ];

  const results: AbandonmentCandidate[] = [];

  for (const order of candidateOrders) {
    // 1. Check for captured or authorized payments (authorized acts as pending/processing here)
    const hasCaptured = order.payments.some(p => p.status === "captured");
    const hasAuthorized = order.payments.some(p => p.status === "authorized");
    
    if (hasCaptured || hasAuthorized) {
      continue;
    }

    // 2. Check for existing opportunities
    const existingOpps = await db.revenueOpportunity.findMany({
      where: {
        orderId: order.razorpayOrderId
      }
    });

    const hasAbandonmentOpp = existingOpps.some(o => o.source === "CHECKOUT_ABANDONMENT");
    if (hasAbandonmentOpp) {
      continue; // Already processed
    }

    const activeFailureOpp = existingOpps.find(
      o => o.source === "PAYMENT_FAILURE" && activeOppStatuses.includes(o.status)
    );
    if (activeFailureOpp) {
      continue; // Suppress because a payment failure opp is active
    }

    // Calculate facts
    const paymentAttempts = order.payments.length;
    const failedPayments = order.payments.filter(p => p.status === "failed").length;
    const pendingPayments = order.payments.filter(p => p.status === "authorized").length; 
    const successfulPayments = order.payments.filter(p => p.status === "captured").length;

    let customerHistory = null;
    let previousRecoveryActions = 0;

    if (order.customerId) {
      // Find all payments linked to orders of this customer
      const custOrders = await db.order.findMany({
        where: { customerId: order.customerId },
        include: { payments: true }
      });
      
      let totalCaptured = 0;
      let countCaptured = 0;
      let countFailed = 0;
      let latestCapture: Date | null = null;

      for (const ord of custOrders) {
        for (const p of ord.payments) {
          if (p.status === "captured") {
            countCaptured++;
            totalCaptured += p.amountSubunits;
            if (!latestCapture || p.createdAt > latestCapture) {
              latestCapture = p.createdAt;
            }
          } else if (p.status === "failed") {
            countFailed++;
          }
        }
      }

      customerHistory = {
        lifetimeSuccessfulPayments: countCaptured,
        lifetimeFailedPayments: countFailed,
        averageTransactionValue: countCaptured > 0 ? Math.floor(totalCaptured / countCaptured) : 0,
        mostRecentSuccessDate: latestCapture ? latestCapture.toISOString() : null
      };

      const opps = await db.revenueOpportunity.findMany({
        where: { customerId: order.customerId },
        include: { recoveryActions: true }
      });
      previousRecoveryActions = opps.reduce((sum, opp) => sum + opp.recoveryActions.length, 0);
    }

    results.push({
      orderId: order.razorpayOrderId,
      merchantId,
      customerId: order.customerId,
      evidence: {
        orderId: order.razorpayOrderId,
        orderAgeMinutes: Math.floor((now.getTime() - order.createdAt.getTime()) / 60000),
        orderAmount: order.amountSubunits,
        currency: order.currency,
        paymentAttemptCount: paymentAttempts,
        successfulPaymentCount: successfulPayments,
        failedPaymentCount: failedPayments,
        pendingPaymentCount: pendingPayments,
        customerHistory,
        previousRecoveryActions,
        eligibilityReason: "Order unpaid beyond timeout with no active payment attempts and no active payment failures."
      }
    });
  }

  return results;
}
