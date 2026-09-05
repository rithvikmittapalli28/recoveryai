/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma as db } from "../../lib/db/prisma";
import { runUnifiedScoringAgent, UnifiedScoringAIOutput } from "./agent";

export const DEFAULT_SEVERITY_WEIGHTS: Record<string, number> = {
  LOW: 1.0,
  MEDIUM: 1.2,
  HIGH: 1.5,
  CRITICAL: 2.0,
};

export interface UnifiedScoringConfig {
  severityWeights?: Record<string, number>;
  baseTargetValue?: number;
}

export function calculateDeterministicPriorityScore(
  amountAtRisk: number,
  recoveryProbability: number,
  urgency: string,
  weights: Record<string, number>,
  baseTargetValue: number
): number {
  const baseValue = amountAtRisk * recoveryProbability;
  const normalizedValue = baseValue / baseTargetValue;
  const weight = weights[urgency] || 1.0;
  
  const score = normalizedValue * weight;
  return Math.min(100, Math.max(0, score));
}

export async function scoreAndCreateRecoveryAction(
  opportunityId: string,
  domainEvidence: Record<string, any>,
  recommendedAction: string,
  config: UnifiedScoringConfig = {}
) {
  const severityWeights = config.severityWeights || DEFAULT_SEVERITY_WEIGHTS;
  const baseTargetValue = config.baseTargetValue || 10000;

  // 1. Transaction to safely claim the opportunity for scoring
  const opp = await db.$transaction(async (tx) => {
    const existingOpp = await tx.revenueOpportunity.findUnique({
      where: { id: opportunityId },
      include: { recoveryActions: true, merchant: true }
    });

    if (!existingOpp) throw new Error("Opportunity not found");
    if (existingOpp.status !== "OPEN" && existingOpp.status !== "ANALYZED") {
      throw new Error("Opportunity is not in a scorable state");
    }

    // Idempotency: Prevent duplicate scoring actions if one already exists
    if (existingOpp.recoveryActions.length > 0) {
       throw new Error("Recovery action already exists for this opportunity");
    }

    // Lock the opportunity to ANALYZED state to prevent concurrent scorings
    return await tx.revenueOpportunity.update({
      where: { id: opportunityId },
      data: { status: "ANALYZED" },
      include: { merchant: true }
    });
  });

  // 2. Determine if it's unrecoverable strictly by policy
  let aiOutput: UnifiedScoringAIOutput | null = null;
  let finalProbability = 0;
  let urgency = "LOW";
  let reasoning = "Determined deterministically.";

  let skipAI = false;

  if (opp.source === "REVENUE_LEAKAGE" && opp.leakageCategory === "DISPUTE_LOSS") {
    skipAI = true;
    finalProbability = 0.0;
    reasoning = "Dispute losses are categorically unrecoverable by standard recovery actions.";
    urgency = "LOW";
  } else if (opp.source === "REVENUE_LEAKAGE" && opp.leakageCategory === "REFUND_LEAKAGE") {
    // Determine if refund is potentially recoverable (future revenue) vs investigation only
    // If it's investigation only, we still use AI but bound the expected recovery to 0. 
    // Wait, the prompt says "allow scoring only where the opportunity represents potentially recoverable future revenue. Otherwise classify it as investigation-only through deterministic policy."
    // If evidence says amountAtRisk is 0 or null (and only amountActuallyLost exists), it's unrecoverable
    const evidence = opp.evidence as any;
    if (!evidence || !evidence.amountAtRisk || evidence.amountAtRisk === 0) {
      skipAI = true;
      finalProbability = 0.0;
      reasoning = "Refunds without forward-looking at-risk revenue are classified as investigation-only.";
      urgency = "LOW";
    }
  }

  // 3. Consult Unified AI Agent if not deterministic
  if (!skipAI) {
    aiOutput = await runUnifiedScoringAgent(
      opp.source,
      opp.amountSubunits,
      opp.currency,
      { ...domainEvidence, recommendedAction },
      { name: opp.merchant.name }
    );
    finalProbability = aiOutput.recoveryProbability;
    urgency = aiOutput.urgency;
    reasoning = aiOutput.reasoning;
  }

  // 4. Deterministic Calculations
  // Prevent AI from calculating values
  const expectedRecoveryValue = Math.floor(opp.amountSubunits * finalProbability);
  
  const priorityScore = calculateDeterministicPriorityScore(
    opp.amountSubunits,
    finalProbability,
    urgency,
    severityWeights,
    baseTargetValue
  );

  // 5. Update opportunity and create recovery action
  const finalOpp = await db.$transaction(async (tx) => {
    // Double check status hasn't changed maliciously
    const check = await tx.revenueOpportunity.findUnique({ where: { id: opp.id } });
    if (check?.status !== "ANALYZED") throw new Error("Opportunity status mutated during scoring");

    await tx.revenueOpportunity.update({
      where: { id: opp.id },
      data: {
        priorityScore,
        status: "ACTION_PROPOSED",
      }
    });

    await tx.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id,
        actionType: skipAI && finalProbability === 0 ? "MANUAL_REVIEW" : recommendedAction,
        status: "PENDING_APPROVAL",
        amountSubunits: opp.amountSubunits,
        currency: opp.currency,
        aiReasoning: reasoning,
        recoveryProbability: finalProbability,
        expectedRecoveryValue: expectedRecoveryValue
      }
    });

    return await tx.revenueOpportunity.findUnique({
      where: { id: opp.id },
      include: { recoveryActions: true }
    });
  });

  return finalOpp;
}
