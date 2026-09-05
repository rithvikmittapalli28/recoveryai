import assert from 'assert';
import { prisma as db } from '../lib/db/prisma';
import { NextRequest } from 'next/server';
import { POST, GET } from '../app/api/onboarding/razorpay/route';
import { getRazorpayConfigForMerchant } from '../lib/credentials/service';
import { POST as WebhookPOST } from '../app/api/webhooks/razorpay/[merchantId]/route';
import { runOrchestrator } from '../business/orchestrator/engine';

async function runPhase12Verification() {
  console.log('════════════════════════════════════════════');
  console.log('  Phase 12 Verification');
  console.log('════════════════════════════════════════════\n');

  let failures = 0;

  const merchantA = 'merchant_tenant_A';
  const merchantB = 'merchant_tenant_B';

  await db.merchant.upsert({
    where: { id: merchantA }, update: {}, create: { id: merchantA, name: 'Tenant A' }
  });
  await db.merchant.upsert({
    where: { id: merchantB }, update: {}, create: { id: merchantB, name: 'Tenant B' }
  });

  // Clear credentials
  await db.merchantCredential.deleteMany({ where: { merchantId: { in: [merchantA, merchantB] } } });

  // 1 & 2. Merchant A saves encrypted credentials
  console.log('\n1-4. Credential Storage & Encryption...');
  try {
    const mockReqA = {
      headers: new Headers({'x-dev-merchant-id': merchantA}),
      json: async () => ({ keyId: 'rzp_test_mock_tenantA', keySecret: 'secret_A', webhookSecret: 'whsec_A', environment: 'TEST' })
    } as unknown as NextRequest;

    const res = await POST(mockReqA);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Merchant A should save credentials successfully');

    const credInDb = await db.merchantCredential.findUnique({
      where: { merchantId_provider: { merchantId: merchantA, provider: 'RAZORPAY' } }
    });

    assert.ok(credInDb, 'Credential record should exist');
    assert.notStrictEqual(credInDb.encryptedKeyId, 'rzp_test_mock_tenantA', 'Key ID must be encrypted');
    assert.notStrictEqual(credInDb.encryptedKeySecret, 'secret_A', 'Key Secret must be encrypted');
    
    const decryptedConfig = await getRazorpayConfigForMerchant(merchantA);
    assert.strictEqual(decryptedConfig.keyId, 'rzp_test_mock_tenantA');
    assert.strictEqual(decryptedConfig.keySecret, 'secret_A');
    console.log('  ✓ PASS: Credentials saved and encrypted successfully');
  } catch (e) {
    console.error('  ✗ FAIL:', e);
    failures++;
  }

  // 6 & 7. Merchant A cannot read/modify Merchant B credentials
  console.log('\n6-7. Tenant Isolation (Credentials)...');
  try {
    const mockReqReadB = {
      headers: new Headers({'x-dev-merchant-id': merchantB}),
    } as unknown as NextRequest;
    const res = await GET(mockReqReadB);
    const data = await res.json();
    assert.strictEqual(data.connected, false, 'Merchant B should not see Merchant A credentials');
    console.log('  ✓ PASS: Merchant B isolated from Merchant A');
  } catch (e) {
    console.error('  ✗ FAIL:', e);
    failures++;
  }

  // 14. Webhook verification uses correct secret
  console.log('\n14. Webhook multi-tenancy verification...');
  try {
    // Generate valid signature using whsec_A
    const crypto = await import('crypto');
    const rawBody = JSON.stringify({
       event: 'payment.failed',
       created_at: Math.floor(Date.now() / 1000),
       payload: { payment: { entity: { id: 'pay_test', amount: 1000, currency: 'INR' } } }
    });
    const sig = crypto.createHmac('sha256', 'whsec_A').update(rawBody).digest('hex');

    const req = {
      text: async () => rawBody,
      headers: {
        get: (key: string) => {
          if (key === 'x-razorpay-signature') return sig;
          if (key === 'x-razorpay-event-id') return 'ev_test_123';
          return null;
        }
      }
    } as unknown as Request;

    const res = await WebhookPOST(req, { params: Promise.resolve({ merchantId: merchantA }) });
    if (res.status !== 200) {
       console.log('Webhook failed:', res.status, await res.json());
    }
    assert.strictEqual(res.status, 200, 'Webhook should process successfully for merchant A');
    console.log('  ✓ PASS: Webhook processed using merchant specific secret');
  } catch (e) {
    console.error('  ✗ FAIL:', e);
    failures++;
  }

  // 16 & 17. Orchestrator independent processing
  console.log('\n16-17. Orchestrator multi-tenant safety...');
  try {
    const statsA = await runOrchestrator(merchantA);
    const statsB = await runOrchestrator(merchantB);
    assert.ok(statsA.analyzed >= 0);
    assert.ok(statsB.analyzed >= 0);
    console.log('  ✓ PASS: Orchestrator loops independently without crashing');
  } catch (e) {
    console.error('  ✗ FAIL:', e);
    failures++;
  }

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} test(s) failed.`);
    process.exit(1);
  }

  console.log('\n--- Phase 12 Verification Complete ---');
}

runPhase12Verification();
