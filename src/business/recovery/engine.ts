import { prisma } from '../../lib/db/prisma';
import { analyzePaymentFailure, PaymentRecoveryDecision } from '../../ai/agents/payment-recovery';
import { RecoveryPolicy } from './policy';
import { scoreAndCreateRecoveryAction } from '../scoring/engine';

export async function runRecoveryEngine(opportunityId: string) {
  const opportunity = await prisma.revenueOpportunity.findUnique({
    where: { id: opportunityId },
  });

  if (!opportunity || opportunity.status !== 'OPEN') {
     throw new Error("Opportunity is not open or not found.");
  }

  // Find the triggering event if available
  const event = opportunity.sourceId ? await prisma.financialEvent.findFirst({
     where: { sourceId: opportunity.sourceId }
  }) : null;

  // 1. Deterministic Routing
  let aiDecision: PaymentRecoveryDecision;
  
  if (opportunity.source === 'PAYMENT_FAILURE') {
     aiDecision = await analyzePaymentFailure(opportunity, event);
  } else {
     // NOTE: Abandonment and Leakage are now processed by their own engines which directly invoke scoring.
     // This engine remains strictly for Payment Failure (Phase 3).
     throw new Error(`Unsupported opportunity source for legacy engine: ${opportunity.source}`);
  }

  // 2. Process Decision
  if (!aiDecision.recoverable || aiDecision.recommendedAction === 'NONE') {
      await prisma.revenueOpportunity.update({
          where: { id: opportunityId },
          data: { status: 'ANALYZED' }
      });
      return { success: true, message: "Analyzed as unrecoverable.", decision: aiDecision };
  }

  // 3. Policy Validation
  const policyCheck = await RecoveryPolicy.validateActionProposal(
      opportunityId, 
      aiDecision.recommendedAction,
      opportunity.amountSubunits,
      opportunity.currency
  );

  if (!policyCheck.valid) {
      await prisma.revenueOpportunity.update({
          where: { id: opportunityId },
          data: { status: 'DECLINED' }
      });
      return { success: false, reason: policyCheck.reason, decision: aiDecision };
  }

  // 4. Score and Create Recovery Action
  await scoreAndCreateRecoveryAction(
      opportunityId,
      aiDecision,
      aiDecision.recommendedAction
  );

  return { success: true, message: "Action proposed and awaiting approval.", decision: aiDecision };
}
