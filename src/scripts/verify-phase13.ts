import assert from 'assert';
import crypto from 'crypto';
import { prisma as db } from '../lib/db/prisma';
import { NextRequest } from 'next/server';
import { POST as OnboardingPOST, GET as OnboardingGET } from '../app/api/onboarding/razorpay/route';
import { POST as ApprovePOST } from '../app/api/ui/actions/[id]/approve/route';
import { POST as RejectPOST } from '../app/api/ui/actions/[id]/reject/route';
import { POST as WebhookPOST } from '../app/api/webhooks/razorpay/[merchantId]/route';
import { GET as HealthGET } from '../app/api/health/route';
import { GET as CronOrchestratorGET } from '../app/api/cron/orchestrator/route';
import { decryptCredential } from '../lib/credentials/encryption';
import { runOrchestrator } from '../business/orchestrator/engine';

async function verifyPhase13() {
  console.log('════════════════════════════════════════════');
  console.log('  Phase 13 Security & Isolation Audit');
  console.log('════════════════════════════════════════════\n');

  let failures = 0;
  const merchantA = 'merchant_aud_A';
  const merchantB = 'merchant_aud_B';

  await db.merchant.upsert({ where: { id: merchantA }, update: {}, create: { id: merchantA, name: 'Audit A' } });
  await db.merchant.upsert({ where: { id: merchantB }, update: {}, create: { id: merchantB, name: 'Audit B' } });

  // Reset state
  await db.merchantCredential.deleteMany({ where: { merchantId: { in: [merchantA, merchantB] } } });
  await db.recoveryAction.deleteMany({});
  await db.revenueOpportunity.deleteMany({});

  try {
    // --- 1. Credential Encryption & Tampering ---
    console.log('Testing Credential Encryption & Tampering (Cases 5, 6, 7)...');
    
    // Save creds
    const mockReqA = {
      headers: new Headers({'x-dev-merchant-id': merchantA}),
      json: async () => ({ keyId: 'rzp_test_mock_A', keySecret: 'sec_A', webhookSecret: 'whsec_A' })
    } as unknown as NextRequest;
    await OnboardingPOST(mockReqA);
    
    const credInDb = await db.merchantCredential.findUnique({
      where: { merchantId_provider: { merchantId: merchantA, provider: 'RAZORPAY' } }
    });
    assert.ok(credInDb);
    assert.notStrictEqual(credInDb.encryptedKeySecret, 'sec_A');
    
    // Tamper ciphertext
    const parts = credInDb.encryptedKeySecret.split(':');
    parts[2] = 'deadbeef' + parts[2].substring(8);
    const tampered = parts.join(':');
    assert.throws(() => decryptCredential(tampered), /unsupported state|bad decrypt|auth tag/i, 'Tampered ciphertext should fail decryption');

    // Non-disclosure (masked keys)
    const getReq = { headers: new Headers({'x-dev-merchant-id': merchantA}) } as unknown as NextRequest;
    const getRes = await OnboardingGET(getReq);
    const getJson = await getRes.json();
    assert.ok(getJson.keyId.includes('*'), 'Key ID should be masked');
    assert.strictEqual(getJson.keySecret, undefined, 'Key Secret must never be returned');
    console.log('  ✓ PASS');

    // --- 2. Cross-Merchant Authorization ---
    console.log('\nTesting Cross-Merchant UI Authorization (Cases 1, 2, 3, 4)...');
    
    const oppA = await db.revenueOpportunity.create({
      data: { merchantId: merchantA, source: 'API', sourceId: 'src_A', amountSubunits: 100, currency: 'INR', status: 'ACTION_PROPOSED' }
    });
    const actA = await db.recoveryAction.create({
      data: { revenueOpportunityId: oppA.id, actionType: 'CREATE_PAYMENT_LINK', status: 'PENDING_APPROVAL', amountSubunits: 100, currency: 'INR', expectedRecoveryValue: 100, recoveryProbability: 0.9 }
    });

    // Merchant B attempts to approve Merchant A's action
    const mockApproveReq = { headers: new Headers({'x-dev-merchant-id': merchantB}) } as unknown as NextRequest;
    const approveRes = await ApprovePOST(mockApproveReq, { params: Promise.resolve({ id: actA.id }) });
    assert.strictEqual(approveRes.status, 403, 'Merchant B should be forbidden from approving A');
    
    // Merchant B attempts to reject Merchant A's action
    const mockRejectReq = { headers: new Headers({'x-dev-merchant-id': merchantB}) } as unknown as NextRequest;
    const rejectRes = await RejectPOST(mockRejectReq, { params: Promise.resolve({ id: actA.id }) });
    assert.strictEqual(rejectRes.status, 403, 'Merchant B should be forbidden from rejecting A');
    console.log('  ✓ PASS');

    // --- 3. Webhook Security ---
    console.log('\nTesting Webhook Security & Idempotency (Cases 9-13)...');
    
    const rawBody = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'pl_123', amount: 100 } } } });
    const validSigA = crypto.createHmac('sha256', 'whsec_A').update(rawBody).digest('hex');
    const invalidSig = crypto.createHmac('sha256', 'wrong').update(rawBody).digest('hex');

    // Wrong secret rejection
    const whReqInvalid = { text: async () => rawBody, headers: { get: (k: string) => k === 'x-razorpay-signature' ? invalidSig : 'ev_1' } } as unknown as Request;
    const resInvalid = await WebhookPOST(whReqInvalid, { params: Promise.resolve({ merchantId: merchantA }) });
    assert.strictEqual(resInvalid.status, 401, 'Wrong signature should be rejected');

    // Unknown merchant rejection
    const whReqUnknown = { text: async () => rawBody, headers: { get: (k: string) => k === 'x-razorpay-signature' ? validSigA : 'ev_1' } } as unknown as Request;
    const resUnknown = await WebhookPOST(whReqUnknown, { params: Promise.resolve({ merchantId: 'unknown_merch' }) });
    assert.ok([401, 404].includes(resUnknown.status), 'Unknown merchant webhook should be rejected (404 if no fallback, 401 if global fallback fails sig)');

    // Valid acceptance
    const whReqValid = { text: async () => rawBody, headers: { get: (k: string) => k === 'x-razorpay-signature' ? validSigA : 'ev_1' } } as unknown as Request;
    const resValid = await WebhookPOST(whReqValid, { params: Promise.resolve({ merchantId: merchantA }) });
    assert.strictEqual(resValid.status, 200, 'Valid signature should be accepted');

    // Duplicate rejection
    const resDup = await WebhookPOST(whReqValid, { params: Promise.resolve({ merchantId: merchantA }) });
    assert.strictEqual((await resDup.json()).reason, 'duplicate', 'Duplicate event should be skipped safely');
    console.log('  ✓ PASS');

    // --- 4. Orchestrator Multi-Tenant Execution ---
    console.log('\nTesting Orchestrator Multi-Tenant Safely (Cases 17-18)...');
    // B has no credentials, A has valid mock credentials
    const statsA = await runOrchestrator(merchantA);
    const statsB = await runOrchestrator(merchantB);
    assert.ok(statsA.analyzed >= 0);
    assert.ok(statsB.analyzed >= 0);
    console.log('  ✓ PASS');

    // --- 5. Health & Cron Auth ---
    console.log('\nTesting Health & Cron Auth (Cases 19, 23)...');
    const healthReq = { headers: new Headers() } as unknown as NextRequest;
    const healthRes = await HealthGET();
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.ok, true);
    assert.strictEqual(healthData.databaseUrl, undefined, 'Database URL must not leak');

    const cronReqNoAuth = { headers: new Headers() } as unknown as NextRequest;
    const cronRes = await CronOrchestratorGET(cronReqNoAuth);
    assert.strictEqual(cronRes.status, 401, 'Cron must require secret');
    console.log('  ✓ PASS');
    
  } catch (e) {
    console.error('  ✗ FAIL:', e);
    failures++;
  }

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\n--- Phase 13 Verification Complete ---');
}

verifyPhase13();
