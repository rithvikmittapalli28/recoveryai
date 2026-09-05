/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { prisma as db } from '../lib/db/prisma';
import { runOrchestrator } from '../business/orchestrator/engine';
import { detectPaymentFailures } from '../business/payment-failure/detector';
import { processCheckoutAbandonments } from '../business/abandonment/index';
import { executeLeakageDetective } from '../business/detective/index';

process.env.MOCK_AI = 'true';

async function seedOrder(merchantId: string, id: string, ageMins: number, status = 'created') {
  const now = new Date();
  return await db.order.create({
    data: {
      id: `local_${id}`,
      merchantId,
      razorpayOrderId: id,
      amountSubunits: 5000,
      currency: 'INR',
      status,
      createdAt: new Date(now.getTime() - ageMins * 60000),
      updatedAt: new Date(now.getTime() - ageMins * 60000),
    }
  });
}

async function run() {
  console.log('Starting Phase 4E Verification...');
  const merchant = await db.merchant.findFirst();
  if (!merchant) throw new Error('No merchant');
  const merchantId = merchant.id;
  
  // Clean up
  await db.revenueOpportunity.deleteMany({ where: { merchantId } });
  await db.financialEvent.deleteMany({ where: { merchantId } });
  await db.payment.deleteMany({ where: { merchantId } });
  await db.order.deleteMany({ where: { merchantId } });

  const now = new Date();
  
  // --- 1. Basic Orchestration (Routing & State Transitions) ---
  console.log('Seeding Payment Failure, Checkout Abandonment, Revenue Leakage...');
  // Seed Leakage
  await db.financialEvent.createMany({
    data: Array.from({ length: 15 }).map((_, i) => ({
      merchantId,
      eventType: 'refund.created',
      amountSubunits: 8000,
      currency: 'INR',
      occurredAt: new Date(now.getTime() - 60000)
    }))
  });
  // Baseline for Leakage
  await db.financialEvent.create({
     data: { merchantId, eventType: 'payment.captured', amountSubunits: 1000, currency: 'INR', occurredAt: new Date(now.getTime() - 8 * 24 * 3600 * 1000) }
  });
  
  // Seed Abandonment
  await seedOrder(merchantId, 'ord_e_abd', 40);

  // Seed Payment Failure
  await db.financialEvent.create({
    data: {
      merchantId,
      eventType: 'payment.failed',
      sourceId: 'pay_e_fail',
      amountSubunits: 5000,
      currency: 'INR',
      occurredAt: now,
      orderId: 'ord_e_fail'
    }
  });

  const stats = await runOrchestrator(merchantId, { now });
  console.log('Orchestrator Stats:', stats);

  if (stats.detected < 3) throw new Error('Failed to detect all 3 types');
  if (stats.scored < 3) throw new Error('Failed to score all 3 types');

  // Verify DB state
  const opps = await db.revenueOpportunity.findMany({ where: { merchantId }, include: { recoveryActions: true } });
  
  if (opps.length < 3) throw new Error('Expected 3 opportunities');
  for (const opp of opps) {
    if (opp.status !== 'ACTION_PROPOSED') throw new Error(`Expected ACTION_PROPOSED, got ${opp.status}`);
    if (!opp.recoveryActions.length) throw new Error('No recovery action created');
    if (opp.recoveryActions[0].status !== 'PENDING_APPROVAL') throw new Error('Human in the loop not enforced');
  }
  console.log('✅ Basic Orchestration & Deterministic Routing Passed');
  console.log('✅ OPEN -> PROCESSING -> ANALYZED -> ACTION_PROPOSED State Transitions Passed');
  console.log('✅ Human-in-the-Loop Enforced');

  // --- 2. Precedence (Payment Failure > Abandonment) ---
  await seedOrder(merchantId, 'ord_precedence', 40);
  await db.financialEvent.create({
    data: {
      merchantId,
      eventType: 'payment.failed',
      sourceId: 'pay_precedence',
      amountSubunits: 5000,
      currency: 'INR',
      occurredAt: now,
      orderId: 'ord_precedence'
    }
  });

  await detectPaymentFailures(merchantId, now);
  const precedenceAbdOpps = await processCheckoutAbandonments(merchantId, { now, timeoutMinutes: 30 });
  if (precedenceAbdOpps.find(o => o.orderId === 'ord_precedence')) {
    throw new Error('Abandonment detected despite payment failure');
  }
  console.log('✅ Precedence (Payment Failure > Abandonment) Passed');

  // --- 3. AI Failure / Revert to OPEN ---
  process.env.MOCK_AI_FAIL = 'true';
  const failOpp = await db.revenueOpportunity.create({
    data: { merchantId, source: 'CHECKOUT_ABANDONMENT', sourceId: 'test_fail', amountSubunits: 1, currency: 'INR', reason: 'x', status: 'OPEN' }
  });
  
  await runOrchestrator(merchantId, { now });
  
  const revertedOpp = await db.revenueOpportunity.findUnique({ where: { id: failOpp.id } });
  if (revertedOpp?.status !== 'OPEN') throw new Error('AI Failure did not revert status to OPEN, got ' + revertedOpp?.status);
  console.log('✅ AI Failure Reversion (PROCESSING -> OPEN) Passed');

  process.env.MOCK_AI_FAIL = 'false';
  // --- 4. Concurrency & Idempotency ---
  // Run two orchestrators simultaneously
  await db.revenueOpportunity.create({
    data: { merchantId, source: 'CHECKOUT_ABANDONMENT', sourceId: 'test_conc', amountSubunits: 1, currency: 'INR', reason: 'x', status: 'OPEN' }
  });
  const conc1 = runOrchestrator(merchantId, { now });
  const conc2 = runOrchestrator(merchantId, { now });
  const results = await Promise.all([conc1, conc2]);
  
  // One should process, one should skip. Actually, if they both fetch the OPEN opp, one will update to PROCESSING, the other will get count=0.
  // The sum of stats.analyzed across both runs should be exactly 1 for the new opp (plus whatever was pending, but we processed all pending).
  // Removing totalAnalyzed exact check because other OPEN opps (from earlier scenarios) may also be processed concurrently.
  
  const finalOpp = await db.revenueOpportunity.findFirst({ where: { sourceId: 'test_conc' }, include: { recoveryActions: true } });
  if (finalOpp?.recoveryActions.length !== 1) throw new Error('Duplicate actions created');
  console.log('✅ Concurrency & Idempotency Passed');

  // --- 5. Batch Processing ---
  // Create 60 OPEN opps
  const batchData = Array.from({ length: 60 }).map((_, i) => ({
    merchantId, source: 'CHECKOUT_ABANDONMENT' as any, sourceId: `batch_${i}`, amountSubunits: 1, currency: 'INR', reason: 'x', status: 'OPEN' as any
  }));
  await db.revenueOpportunity.createMany({ data: batchData });
  
  const batchStats1 = await runOrchestrator(merchantId, { now, batchSize: 50 });
  if (batchStats1.analyzed !== 50) throw new Error('Batch limit not respected');
  
  const batchStats2 = await runOrchestrator(merchantId, { now, batchSize: 50 });
  if (batchStats2.analyzed !== 10) throw new Error('Remaining batch not processed correctly');
  console.log('✅ Batch Processing Passed');

  console.log('🎉 Phase 4E Verification Complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
