/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import crypto from "crypto";
import { runDeterministicAnalysis, DetectedAnomaly, DEFAULT_CONFIG, DetectiveConfig } from "./analyzer";
import { prisma as db } from "../../lib/db/prisma";

export interface DetectiveRunOptions {
  now?: Date;
  config?: DetectiveConfig;
  severityWeights?: Record<string, number>;
  baseTargetValue?: number;
}

function generateIdempotencyKey(merchantId: string, anomaly: DetectedAnomaly): string {
  const payload = [
    merchantId,
    anomaly.leakageCategory,
    anomaly.evidence.primaryGrouping || "all",
    anomaly.evidence.windowStart,
    anomaly.evidence.windowEnd
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function executeLeakageDetective(merchantId: string, options: DetectiveRunOptions = {}) {
  const now = options.now || new Date();
  const config = options.config || DEFAULT_CONFIG;
  const severityWeights = options.severityWeights;
  const baseTargetValue = options.baseTargetValue;

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new Error("Merchant not found");

  const anomalies = await runDeterministicAnalysis(merchantId, now, config);
  const results = [];

  for (const anomaly of anomalies) {
    const fingerprint = generateIdempotencyKey(merchantId, anomaly);
    const existing = await db.revenueOpportunity.findFirst({
      where: {
        merchantId,
        source: "REVENUE_LEAKAGE",
        sourceId: fingerprint
      }
    });

    if (existing) {
      continue; // Skip duplicate
    }

    // 1. Create RevenueOpportunity in OPEN state
    const opp = await db.revenueOpportunity.create({
      data: {
        merchantId,
        source: "REVENUE_LEAKAGE",
        sourceId: fingerprint,
        amountSubunits: anomaly.evidence.amountAtRisk || anomaly.evidence.amountActuallyLost || 0,
        currency: "INR",
        reason: `Anomaly detected in ${anomaly.leakageCategory}`,
        leakageCategory: anomaly.leakageCategory,
        status: "OPEN",
        evidence: anomaly.evidence as any
      }
    });

    results.push(opp);
  }

  return results;
}
