/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma as db } from '../../lib/db/prisma';
import { executeLeakageDetective } from '../detective/index';
import { processCheckoutAbandonments } from '../abandonment/index';
import { detectPaymentFailures } from '../payment-failure/detector';
import { analyzePaymentFailure } from '../../ai/agents/payment-recovery';
import { runAbandonmentAgent } from '../abandonment/agent';
import { runLeakageDetectiveAgent } from '../detective/agent';
import { scoreAndCreateRecoveryAction } from '../scoring/engine';
import { logger } from '../../lib/observability/logger';
import { metrics } from '../../lib/observability/metrics';

export interface OrchestratorOptions {
  now?: Date;
  batchSize?: number;
}

async function getCustomerHistory(customerId: string) {
  const custOrders = await db.order.findMany({
    where: { customerId },
    include: { payments: true }
  });
  
  let totalCaptured = 0;
  let countCaptured = 0;
  let countFailed = 0;
  let latestCapture: Date | null = null;

  for (const ord of custOrders) {
    for (const p of ord.payments) {
      if (p.status === 'captured') {
        countCaptured++;
        totalCaptured += p.amountSubunits;
        if (!latestCapture || p.createdAt > latestCapture) {
          latestCapture = p.createdAt;
        }
      } else if (p.status === 'failed') {
        countFailed++;
      }
    }
  }

  return {
    lifetimeSuccessfulPayments: countCaptured,
    lifetimeFailedPayments: countFailed,
    averageTransactionValue: countCaptured > 0 ? Math.floor(totalCaptured / countCaptured) : 0,
    mostRecentSuccessDate: latestCapture ? latestCapture.toISOString() : null
  };
}

export async function runOrchestrator(merchantId: string, options: OrchestratorOptions = {}) {
  const now = options.now || new Date();
  const batchSize = options.batchSize || 50;

  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new Error('Merchant not found');

  const stats = { detected: 0, analyzed: 0, scored: 0, skipped: 0, failed: 0 };

  // --- STAGE 1: DETECT ---
  // Run deterministic detectors to create OPEN opportunities
  const paymentFailures = await detectPaymentFailures(merchantId, now);
  const leakages = await executeLeakageDetective(merchantId, { now });
  const abandonments = await processCheckoutAbandonments(merchantId, { now });

  stats.detected = leakages.length + abandonments.length + paymentFailures.length;

  // --- STAGE 2: DOMAIN AI ANALYSIS ---
  // Fetch OPEN opportunities
  const openOpps = await db.revenueOpportunity.findMany({
    where: { merchantId, status: 'OPEN' },
    orderBy: { detectedAt: 'asc' },
    take: batchSize
  });

  for (const opp of openOpps) {
    // Atomic Claim: OPEN -> PROCESSING
    const { count } = await db.revenueOpportunity.updateMany({
      where: { id: opp.id, status: 'OPEN' },
      data: { status: 'PROCESSING' }
    });

    if (count === 0) {
      stats.skipped++;
      continue;
    }

    try {
      let aiOutput: any = null;
      let nextStatus = 'ANALYZED';

      if (opp.source === 'PAYMENT_FAILURE') {
        let history = null;
        if (opp.customerId) {
          history = await getCustomerHistory(opp.customerId);
        }
        
        // Pass event as evidence if available
        const event = opp.sourceId ? await db.financialEvent.findFirst({
           where: { sourceId: opp.sourceId, eventType: 'payment.failed' }
        }) : { metadata: opp.evidence };

        const eventWithHistory = { ...event, customerHistory: history };
        const decision = await analyzePaymentFailure(opp, eventWithHistory);
        
        if (!decision.recoverable || decision.recommendedAction === 'NONE') {
          nextStatus = 'DECLINED';
        }
        
        aiOutput = decision;
      } 
      else if (opp.source === 'CHECKOUT_ABANDONMENT') {
        const candidate = {
          orderId: opp.orderId!,
          merchantId: opp.merchantId,
          customerId: opp.customerId,
          evidence: opp.evidence as any
        };
        const decision = await runAbandonmentAgent(candidate, { name: merchant.name });
        aiOutput = decision;
      } 
      else if (opp.source === 'REVENUE_LEAKAGE') {
        const anomaly = {
          leakageCategory: opp.leakageCategory!,
          evidence: opp.evidence as any
        };
        const decision = await runLeakageDetectiveAgent(anomaly, { name: merchant.name });
        aiOutput = decision;
      }

      await db.revenueOpportunity.update({
        where: { id: opp.id },
        data: {
          status: nextStatus as any,
          metadata: { aiAnalysis: aiOutput }
        }
      });
      stats.analyzed++;
      metrics.increment('ai_analysis_succeeded_total', { source: opp.source });

    } catch (err: any) {
      // AI Failure -> revert to OPEN for retry
      logger.error('AI processing failed', {
        system: 'orchestrator',
        opportunityId: opp.id,
        merchantId,
        error: err.message,
      });
      metrics.increment('ai_analysis_failed_total', { source: opp.source });
      await db.revenueOpportunity.update({
        where: { id: opp.id },
        data: { status: 'OPEN' }
      });
      stats.failed++;
    }
  }

  // --- STAGE 3: UNIFIED SCORING ---
  // Fetch ANALYZED opportunities
  const analyzedOpps = await db.revenueOpportunity.findMany({
    where: { merchantId, status: 'ANALYZED' },
    orderBy: { detectedAt: 'asc' },
    take: batchSize
  });

  for (const opp of analyzedOpps) {
    try {
      // Unified Scoring handles its own atomic check, locking it in ANALYZED
      // We pass the aiAnalysis metadata as domainEvidence
      const metadata = opp.metadata as any;
      const aiAnalysis = metadata?.aiAnalysis;
      
      let recommendedAction = aiAnalysis?.recommendedAction || 'MANUAL_REVIEW';
      if (opp.source === 'REVENUE_LEAKAGE' && opp.leakageCategory === 'DISPUTE_LOSS') {
        recommendedAction = 'MANUAL_REVIEW';
      }

      const startScoreTime = Date.now();
      await scoreAndCreateRecoveryAction(
        opp.id,
        aiAnalysis || {},
        recommendedAction
      );
      metrics.observe('ai_scoring_duration_ms', Date.now() - startScoreTime, { source: opp.source });
      metrics.increment('ai_scoring_total', { source: opp.source });
      stats.scored++;
    } catch (err: any) {
      if (err.message === 'Recovery action already exists for this opportunity' || 
          err.message === 'Opportunity status mutated during scoring') {
        stats.skipped++;
      } else {
        logger.error('Unified scoring failed', {
           system: 'orchestrator',
           opportunityId: opp.id,
           merchantId,
           error: err.message,
        });
        metrics.increment('ai_scoring_failure_total', { source: opp.source });
        stats.failed++;
      }
    }
  }

  if (stats.detected > 0 || stats.analyzed > 0 || stats.scored > 0 || stats.failed > 0) {
     logger.info('Orchestrator batch complete', {
       system: 'orchestrator',
       merchantId,
       stats
     });
  }

  return stats;
}
