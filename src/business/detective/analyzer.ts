/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma as db } from "../../lib/db/prisma";

export interface DetectiveConfig {
  windowHours: number;
  baselineDays: number;
  paymentFailure: { minCount: number; deviationThresholdPct: number };
  refundLeakage: { minCount: number; deviationThresholdPct: number };
  disputeLoss: { minCount: number };
  subscriptionFailure: { minCount: number; deviationThresholdPct: number };
  paymentLinkExpiry: { minCount: number; deviationThresholdPct: number };
}

export const DEFAULT_CONFIG: DetectiveConfig = {
  windowHours: 6,
  baselineDays: 7,
  paymentFailure: { minCount: 10, deviationThresholdPct: 50 },
  refundLeakage: { minCount: 5, deviationThresholdPct: 50 },
  disputeLoss: { minCount: 2 },
  subscriptionFailure: { minCount: 5, deviationThresholdPct: 50 },
  paymentLinkExpiry: { minCount: 10, deviationThresholdPct: 20 },
};

export interface LeakageEvidence {
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  affectedEventCount: number;
  amountAtRisk: number;
  amountActuallyLost: number;
  baselineMetric: number;
  currentMetric: number;
  percentageChange: number | null;
  primaryGrouping: string | null;
  groupingType: string | null;
}

export interface DetectedAnomaly {
  leakageCategory: string;
  evidence: LeakageEvidence;
}

export async function runDeterministicAnalysis(
  merchantId: string,
  now: Date = new Date(),
  config: DetectiveConfig = DEFAULT_CONFIG
): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const windowMs = config.windowHours * 60 * 60 * 1000;
  const currentWindowStart = new Date(now.getTime() - windowMs);
  const baselineStart = new Date(now.getTime() - config.baselineDays * 24 * 60 * 60 * 1000);

  // Insufficient data protection
  const oldestEvent = await db.financialEvent.findFirst({
    where: { merchantId },
    orderBy: { occurredAt: 'asc' }
  });

  if (!oldestEvent || oldestEvent.occurredAt > baselineStart) {
    return []; // Return empty if there isn't enough historical data
  }

  // Fetch all relevant events in one go to minimize DB roundtrips
  const events = await db.financialEvent.findMany({
    where: {
      merchantId,
      occurredAt: { gte: baselineStart, lte: now },
      eventType: {
        in: [
          "payment.captured", "payment.failed",
          "refund.created",
          "payment.dispute.created",
          "subscription.halted",
          "payment_link.paid", "payment_link.expired"
        ]
      }
    }
  });

  const currentEvents = events.filter(e => e.occurredAt >= currentWindowStart);
  const baselineEvents = events.filter(e => e.occurredAt < currentWindowStart);
  
  const baselineWindowCount = (config.baselineDays * 24) / config.windowHours;

  // 1. SYSTEMIC PAYMENT FAILURES (grouped by method)
  const currentPaymentEvents = currentEvents.filter(e => e.eventType.startsWith("payment."));
  const baselinePaymentEvents = baselineEvents.filter(e => e.eventType.startsWith("payment."));
  
  const methods = new Set<string>();
  events.forEach(e => {
    if (e.eventType.startsWith("payment.") && e.metadata && typeof e.metadata === "object") {
      const meta = e.metadata as any;
      const method = meta?.payload?.payment?.entity?.method;
      if (method) methods.add(method);
    }
  });

  methods.forEach(method => {
    const isMethod = (e: any) => (e.metadata as any)?.payload?.payment?.entity?.method === method;
    const currMethodEvents = currentPaymentEvents.filter(isMethod);
    const baseMethodEvents = baselinePaymentEvents.filter(isMethod);

    const currFailed = currMethodEvents.filter(e => e.eventType === "payment.failed");
    const baseFailed = baseMethodEvents.filter(e => e.eventType === "payment.failed");

    const currFailCount = currFailed.length;
    const baseFailCountAvg = baseFailed.length / Math.max(1, baselineWindowCount);

    if (currFailCount >= config.paymentFailure.minCount) {
      let pctChange = null;
      let anomalous = false;
      
      if (baseFailCountAvg === 0) {
        anomalous = true;
      } else {
        pctChange = ((currFailCount - baseFailCountAvg) / baseFailCountAvg) * 100;
        if (pctChange >= config.paymentFailure.deviationThresholdPct) {
          anomalous = true;
        }
      }

      if (anomalous) {
        const amountAtRisk = currFailed.reduce((sum, e) => sum + (e.amountSubunits || 0), 0);
        anomalous = true;
        anomalies.push({
          leakageCategory: "SYSTEMIC_PAYMENT_FAILURE",
          evidence: {
            windowStart: currentWindowStart.toISOString(),
            windowEnd: now.toISOString(),
            baselineStart: baselineStart.toISOString(),
            baselineEnd: currentWindowStart.toISOString(),
            affectedEventCount: currFailCount,
            amountAtRisk,
            amountActuallyLost: 0,
            baselineMetric: baseFailCountAvg,
            currentMetric: currFailCount,
            percentageChange: pctChange,
            primaryGrouping: method,
            groupingType: "payment_method"
          }
        });
      }
    }
  });

  // 2. REFUND LEAKAGE
  const currRefunds = currentEvents.filter(e => e.eventType === "refund.created");
  const baseRefunds = baselineEvents.filter(e => e.eventType === "refund.created");
  
  const currRefundCount = currRefunds.length;
  const baseRefundCountAvg = baseRefunds.length / Math.max(1, baselineWindowCount);

  if (currRefundCount >= config.refundLeakage.minCount) {
    let pctChange = null;
    let anomalous = false;
    
    if (baseRefundCountAvg === 0) {
      anomalous = true;
    } else {
      pctChange = ((currRefundCount - baseRefundCountAvg) / baseRefundCountAvg) * 100;
      if (pctChange >= config.refundLeakage.deviationThresholdPct) {
        anomalous = true;
      }
    }

    if (anomalous) {
      const amountLost = currRefunds.reduce((sum, e) => sum + (e.amountSubunits || 0), 0);
      anomalies.push({
        leakageCategory: "REFUND_LEAKAGE",
        evidence: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: now.toISOString(),
          baselineStart: baselineStart.toISOString(),
          baselineEnd: currentWindowStart.toISOString(),
          affectedEventCount: currRefundCount,
          amountAtRisk: 0,
          amountActuallyLost: amountLost, // Refund is actually lost
          baselineMetric: baseRefundCountAvg,
          currentMetric: currRefundCount,
          percentageChange: pctChange,
          primaryGrouping: null,
          groupingType: null
        }
      });
    }
  }

  // 3. DISPUTE LOSS
  const currDisputes = currentEvents.filter(e => e.eventType === "payment.dispute.created");
  const baseDisputes = baselineEvents.filter(e => e.eventType === "payment.dispute.created");

  const currDisputeCount = currDisputes.length;
  const baseDisputeCountAvg = baseDisputes.length / Math.max(1, baselineWindowCount);

  if (currDisputeCount >= config.disputeLoss.minCount) {
    const pctChange = baseDisputeCountAvg === 0 ? null : ((currDisputeCount - baseDisputeCountAvg) / baseDisputeCountAvg) * 100;
    const amountLost = currDisputes.reduce((sum, e) => sum + (e.amountSubunits || 0), 0);
    anomalies.push({
      leakageCategory: "DISPUTE_LOSS",
      evidence: {
        windowStart: currentWindowStart.toISOString(),
        windowEnd: now.toISOString(),
        baselineStart: baselineStart.toISOString(),
        baselineEnd: currentWindowStart.toISOString(),
        affectedEventCount: currDisputeCount,
        amountAtRisk: 0,
        amountActuallyLost: amountLost, // Dispute loss is actually lost
        baselineMetric: baseDisputeCountAvg,
        currentMetric: currDisputeCount,
        percentageChange: pctChange,
        primaryGrouping: null,
        groupingType: null
      }
    });
  }

  // 4. SUBSCRIPTION FAILURE
  const currSubHalts = currentEvents.filter(e => e.eventType === "subscription.halted");
  const baseSubHalts = baselineEvents.filter(e => e.eventType === "subscription.halted");

  const currSubCount = currSubHalts.length;
  const baseSubCountAvg = baseSubHalts.length / Math.max(1, baselineWindowCount);

  if (currSubCount >= config.subscriptionFailure.minCount) {
    let pctChange = null;
    let anomalous = false;
    
    if (baseSubCountAvg === 0) {
      anomalous = true;
    } else {
      pctChange = ((currSubCount - baseSubCountAvg) / baseSubCountAvg) * 100;
      if (pctChange >= config.subscriptionFailure.deviationThresholdPct) {
        anomalous = true;
      }
    }

    if (anomalous) {
      anomalies.push({
        leakageCategory: "SUBSCRIPTION_FAILURE",
        evidence: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: now.toISOString(),
          baselineStart: baselineStart.toISOString(),
          baselineEnd: currentWindowStart.toISOString(),
          affectedEventCount: currSubCount,
          amountAtRisk: 0, // Hard to quantify without looking at future invoices, leave as 0
          amountActuallyLost: 0,
          baselineMetric: baseSubCountAvg,
          currentMetric: currSubCount,
          percentageChange: pctChange,
          primaryGrouping: null,
          groupingType: null
        }
      });
    }
  }

  // 5. PAYMENT LINK EXPIRY
  const currPLExpired = currentEvents.filter(e => e.eventType === "payment_link.expired");
  const basePLExpired = baselineEvents.filter(e => e.eventType === "payment_link.expired");

  const currPLExpCount = currPLExpired.length;
  const basePLExpCountAvg = basePLExpired.length / Math.max(1, baselineWindowCount);

  if (currPLExpCount >= config.paymentLinkExpiry.minCount) {
    let pctChange = null;
    let anomalous = false;
    
    if (basePLExpCountAvg === 0) {
      anomalous = true;
    } else {
      pctChange = ((currPLExpCount - basePLExpCountAvg) / basePLExpCountAvg) * 100;
      if (pctChange >= config.paymentLinkExpiry.deviationThresholdPct) {
        anomalous = true;
      }
    }

    if (anomalous) {
      const amountAtRisk = currPLExpired.reduce((sum, e) => sum + (e.amountSubunits || 0), 0);
      anomalies.push({
        leakageCategory: "PAYMENT_LINK_EXPIRY",
        evidence: {
          windowStart: currentWindowStart.toISOString(),
          windowEnd: now.toISOString(),
          baselineStart: baselineStart.toISOString(),
          baselineEnd: currentWindowStart.toISOString(),
          affectedEventCount: currPLExpCount,
          amountAtRisk: amountAtRisk,
          amountActuallyLost: 0,
          baselineMetric: basePLExpCountAvg,
          currentMetric: currPLExpCount,
          percentageChange: pctChange,
          primaryGrouping: null,
          groupingType: null
        }
      });
    }
  }

  return anomalies;
}
