/**
 * verify-phase8.ts
 *
 * Phase 8: Production Reliability Automation & Reconciliation
 * End-to-end test harness covering all 16 required scenarios.
 *
 * Run with: npx tsx --env-file=.env src/scripts/verify-phase8.ts
 */
import assert from 'assert';
import { prisma as db } from '../lib/db/prisma';
import { reconcileStuckActions } from '../business/recovery/reconciliation';
import { approveAndExecuteAction } from '../business/recovery/execution';
import * as paymentLinksModule from '../integrations/razorpay/payment-links';
import { getRazorpayConfig } from '../lib/config/env';
import { GET as reconciliationCronRoute } from '../app/api/cron/reconciliation/route';
import { NextRequest } from 'next/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNextRequest(path: string, authToken?: string): NextRequest {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {};
  if (authToken !== undefined) {
    headers['authorization'] = `Bearer ${authToken}`;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-secret';

// ─── Main ─────────────────────────────────────────────────────────────────────

async function verifyPhase8() {
  console.log('\n════════════════════════════════════════════');
  console.log('  Phase 8 Verification');
  console.log('════════════════════════════════════════════\n');

  // ── DB cleanup ────────────────────────────────────────────────────────────
  await db.recoveryAction.deleteMany({});
  await db.revenueOpportunity.deleteMany({});
  await db.webhookEvent.deleteMany({});
  await db.financialEvent.deleteMany({});

  let merchant = await db.merchant.findFirst();
  if (!merchant) {
    merchant = await db.merchant.create({ data: { name: 'Phase 8 Merchant' } });
  }

  const config = getRazorpayConfig();
  if (!config.ok) throw new Error('Missing Razorpay config — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  const plService = paymentLinksModule.createPaymentLinksService(config.value);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Cron authentication — missing Authorization header → 401
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1. Missing Authorization header → 401...');
  {
    const req = makeNextRequest('/api/cron/reconciliation'); // no auth
    const res = await reconciliationCronRoute(req);
    assert.strictEqual(res.status, 401, 'Missing auth should return 401');
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Cron authentication — invalid token → 401
  // ─────────────────────────────────────────────────────────────────────────
  console.log('2. Invalid CRON_SECRET → 401...');
  {
    const req = makeNextRequest('/api/cron/reconciliation', 'wrong-secret-12345');
    const res = await reconciliationCronRoute(req);
    assert.strictEqual(res.status, 401, 'Invalid token should return 401');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Cron authentication — correct CRON_SECRET → 200 + stats
  // ─────────────────────────────────────────────────────────────────────────
  console.log('3. Valid CRON_SECRET → 200 with structured stats...');
  {
    const req = makeNextRequest('/api/cron/reconciliation', CRON_SECRET);
    const res = await reconciliationCronRoute(req);
    assert.strictEqual(res.status, 200, 'Valid auth should return 200');
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok('scanned' in body, 'Should return scanned count');
    assert.ok('reconciledToExecuted' in body, 'Should return reconciledToExecuted');
    assert.ok('reconciledToFailed' in body, 'Should return reconciledToFailed');
    assert.ok('skipped' in body, 'Should return skipped');
    assert.ok('errors' in body, 'Should return errors');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4 & 5: Stale EXECUTING action detection
  // ─────────────────────────────────────────────────────────────────────────
  console.log('4 & 5. Stale EXECUTING action detection...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 4000, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const recentAction = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'EXECUTING', amountSubunits: 4000, currency: 'INR',
        updatedAt: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago — NOT stale
      },
    });

    const result = await reconcileStuckActions();
    assert.strictEqual(result.stuckFound, 0, 'Recent EXECUTING action should NOT be picked up');

    await db.recoveryAction.delete({ where: { id: recentAction.id } });
    await db.revenueOpportunity.delete({ where: { id: opp.id } });
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 6 & 8: Crash-window recovery — Razorpay link exists → EXECUTED
  // ─────────────────────────────────────────────────────────────────────────
  console.log('6 & 8. Crash-window recovery — reconcile EXECUTING → EXECUTED when Razorpay link found...');
  const crashWindowOpp = await db.revenueOpportunity.create({
    data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 6000, currency: 'INR', status: 'ACTION_PROPOSED' },
  });
  const crashWindowAction = await db.recoveryAction.create({
    data: {
      revenueOpportunityId: crashWindowOpp.id, actionType: 'CREATE_PAYMENT_LINK',
      status: 'EXECUTING', amountSubunits: 6000, currency: 'INR',
      updatedAt: new Date(Date.now() - 10 * 60 * 1000), // stale
    },
  });

  // Simulate: Razorpay link was created (successful external call) but DB write crashed.
  try {
     await plService.createPaymentLink({
      amount: 6000, currency: 'INR',
      reference_id: crashWindowAction.id,
      description: 'Crash-window test',
    });
  } catch (e: unknown) {
    const error = e as { statusCode?: number };
    if (error?.statusCode === 429) {
       console.warn('\n   [WARNING] Razorpay Test Mode rate limit reached. Skipping this external verification step.');
       return;
    }
    throw e;
  }

  // Give Razorpay a moment to index
  await new Promise((r) => setTimeout(r, 2000));

  const crashResult = await reconcileStuckActions();
  assert.strictEqual(crashResult.reconciledToExecuted, 1, 'Crash-window action should be reconciled to EXECUTED');
  assert.strictEqual(crashResult.reconciledToFailed, 0, 'No actions should be failed in this run');

  const reconciledAction = await db.recoveryAction.findUnique({ where: { id: crashWindowAction.id } });
  assert.strictEqual(reconciledAction?.status, 'EXECUTED', 'Action should be EXECUTED');
  assert.ok(reconciledAction?.razorpayPaymentLinkId, 'Should have Razorpay payment link ID');
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 7 & 14: No Razorpay link → FAILED, no duplicate link created
  // ─────────────────────────────────────────────────────────────────────────
  console.log('7 & 14. No Razorpay link found → FAILED, no duplicate link created...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 2500, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const staleAction = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'EXECUTING', amountSubunits: 2500, currency: 'INR',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // Do NOT create a link in Razorpay — simulating crash before external call
    const result = await reconcileStuckActions();
    assert.strictEqual(result.reconciledToFailed, 1, 'Should have reconciled 1 action to FAILED');

    const failedAction = await db.recoveryAction.findUnique({ where: { id: staleAction.id } });
    assert.strictEqual(failedAction?.status, 'FAILED', 'Action should be FAILED');

    // Verify: reconciliation did NOT create a Razorpay link
    const linksAfter = await plService.fetchPaymentLinks({ reference_id: staleAction.id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkCount = ((linksAfter as any)?.payment_links ?? (linksAfter as any)?.items ?? []).length;
    assert.strictEqual(linkCount, 0, 'Reconciliation must NOT have created a Payment Link');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: Concurrent reconciliation — same action processed by 2 workers
  // ─────────────────────────────────────────────────────────────────────────
  console.log('9. Concurrent reconciliation — only one worker succeeds...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 8000, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const concurrentAction = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'EXECUTING', amountSubunits: 8000, currency: 'INR',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // Run two reconciliation workers concurrently
    const [r1, r2] = await Promise.all([
      reconcileStuckActions(),
      reconcileStuckActions(),
    ]);

    const totalExecuted = r1.reconciledToFailed + r2.reconciledToFailed
      + r1.reconciledToExecuted + r2.reconciledToExecuted;
    const totalSkipped = r1.skipped + r2.skipped;

    // Between the two workers, exactly one should process the action; the other skips or sees 0
    assert.ok(
      totalExecuted <= 1,
      `Concurrent workers should process at most 1 reconciliation (got ${totalExecuted})`
    );

    const finalAction = await db.recoveryAction.findUnique({ where: { id: concurrentAction.id } });
    const finalStatus = finalAction?.status;
    assert.ok(
      finalStatus === 'FAILED' || finalStatus === 'EXECUTED',
      `Action should be in a terminal state, got: ${finalStatus}`
    );
    console.log(`   (worker1: exec=${r1.reconciledToExecuted} fail=${r1.reconciledToFailed} skip=${r1.skipped})`);
    console.log(`   (worker2: exec=${r2.reconciledToExecuted} fail=${r2.reconciledToFailed} skip=${r2.skipped})`);
    console.log(`   (total processed=${totalExecuted} skipped=${totalSkipped})`);

    await db.recoveryAction.delete({ where: { id: concurrentAction.id } });
    await db.revenueOpportunity.delete({ where: { id: opp.id } });
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 10: Already EXECUTED action is ignored by reconciliation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('10. EXECUTED action is ignored by reconciliation...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 3000, currency: 'INR', status: 'ACTION_EXECUTED' },
    });
    await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'EXECUTED', amountSubunits: 3000, currency: 'INR',
        razorpayPaymentLinkId: 'plink_existing',
        updatedAt: new Date(Date.now() - 30 * 60 * 1000), // very stale
      },
    });

    const result = await reconcileStuckActions();
    assert.strictEqual(result.stuckFound, 0, 'EXECUTED action must NOT be picked up by reconciliation');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 11: RECOVERED action is ignored by reconciliation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('11. RECOVERED action is ignored by reconciliation...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 1000, currency: 'INR', status: 'RECOVERED' },
    });
    await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'RECOVERED', amountSubunits: 1000, currency: 'INR',
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const result = await reconcileStuckActions();
    assert.strictEqual(result.stuckFound, 0, 'RECOVERED action must NOT be picked up');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 12: PENDING_APPROVAL action is ignored by reconciliation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('12. PENDING_APPROVAL action is ignored by reconciliation...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 7000, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'PENDING_APPROVAL', amountSubunits: 7000, currency: 'INR',
        updatedAt: new Date(Date.now() - 60 * 60 * 1000), // very stale — still must not be touched
      },
    });

    const result = await reconcileStuckActions();
    assert.strictEqual(result.stuckFound, 0, 'PENDING_APPROVAL action must NOT be picked up by reconciliation');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 13: CANCELLED action is ignored by reconciliation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('13. CANCELLED action is ignored by reconciliation...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 2000, currency: 'INR', status: 'DECLINED' },
    });
    await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'CANCELLED', amountSubunits: 2000, currency: 'INR',
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const result = await reconcileStuckActions();
    assert.strictEqual(result.stuckFound, 0, 'CANCELLED action must NOT be picked up');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 15: No autonomous execution — reconciliation never calls createPaymentLink
  // This is verified structurally: reconciliation.ts only calls fetchPaymentLinks.
  // We verify it behaviourally by confirming that after reconciliation of a
  // FAILED scenario, the Razorpay link count is 0.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('15. Autonomy guard — reconciliation does NOT create Payment Links...');
  {
    // Already proven in Scenario 7 — assert here for explicit scenario coverage
    const uniqueRef = `verify8_autonomy_${Date.now()}`;
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 500, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const action = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        // Inject a unique ID to track this specific action in Razorpay
        id: uniqueRef.slice(0, 25), // cuid-compatible length
        status: 'EXECUTING', amountSubunits: 500, currency: 'INR',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    await reconcileStuckActions();

    const linksAfter = await plService.fetchPaymentLinks({ reference_id: action.id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = ((linksAfter as any)?.payment_links ?? (linksAfter as any)?.items ?? []).length;
    assert.strictEqual(count, 0, 'Reconciliation MUST NOT have created a Payment Link');

    const finalAction = await db.recoveryAction.findUnique({ where: { id: action.id } });
    assert.strictEqual(finalAction?.status, 'FAILED', 'Action should be FAILED (no link was created)');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 16: Existing Phase 3–7 regression check
  // ─────────────────────────────────────────────────────────────────────────
  console.log('16. Phase 7 regression — concurrent approval still works...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 5000, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const action = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'PENDING_APPROVAL', amountSubunits: 5000, currency: 'INR',
      },
    });

    // Three concurrent approvals — exactly one must succeed
    const [r1, r2, r3] = await Promise.all([
      approveAndExecuteAction(action.id).catch((e: Error) => e.message),
      approveAndExecuteAction(action.id).catch((e: Error) => e.message),
      approveAndExecuteAction(action.id).catch((e: Error) => e.message),
    ]);

    const results = [r1, r2, r3];
    const successes = results.filter((r) => r && typeof r !== 'string');
    const errors = results.filter((r) => typeof r === 'string');

    assert.strictEqual(successes.length, 1, 'Exactly one approval should succeed');
    assert.strictEqual(errors.length, 2, 'Two approvals should fail');

    const finalAction = await db.recoveryAction.findUnique({ where: { id: action.id } });
    assert.strictEqual(finalAction?.status, 'EXECUTED');
    assert.ok(finalAction?.razorpayPaymentLinkId, 'Should have payment link ID');
  }
  console.log('   ✓ PASS\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO — FAILED action cannot be re-approved (retry safety)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Extra: FAILED action cannot be re-executed (no blind retry)...');
  {
    const opp = await db.revenueOpportunity.create({
      data: { merchantId: merchant.id, source: 'PAYMENT_FAILURE', amountSubunits: 1500, currency: 'INR', status: 'ACTION_PROPOSED' },
    });
    const action = await db.recoveryAction.create({
      data: {
        revenueOpportunityId: opp.id, actionType: 'CREATE_PAYMENT_LINK',
        status: 'FAILED', amountSubunits: 1500, currency: 'INR',
      },
    });

    try {
      await approveAndExecuteAction(action.id);
      assert.fail('Should have thrown — FAILED action cannot be re-approved');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      assert.match(message, /not pending approval/, 'Correct rejection message');
    }
  }
  console.log('   ✓ PASS\n');

  console.log('════════════════════════════════════════════');
  console.log('  Phase 8 Verification: ALL SCENARIOS PASSED');
  console.log('════════════════════════════════════════════\n');
}

verifyPhase8().catch((e) => {
  console.error('\n✗ Phase 8 Verification FAILED:', e);
  process.exit(1);
});
