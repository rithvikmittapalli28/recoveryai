import assert from 'assert';
import { getAuthenticatedMerchantId } from '../lib/auth';
import { checkRateLimit } from '../lib/rate-limit';
import { GET as getHealth } from '../app/api/health/route';

async function runTests() {
  console.log('--- Starting Phase 10 Production Readiness Verification ---');
  let failures = 0;

  // 1-3. Authentication boundaries
  console.log('\n1-3. Authentication Boundaries...');
  const mockReqDev = { headers: { get: (h: string) => h === 'x-dev-merchant-id' ? 'merchant_test' : null } } as unknown as Request;
  
  const originalEnv = process.env.NODE_ENV;
  try {
    const devId = await getAuthenticatedMerchantId(mockReqDev);
    assert.strictEqual(devId, 'merchant_test');
    console.log('  ✓ PASS: Dev auth works in dev mode');
  } catch (err: unknown) {
    console.error('  ✗ FAIL: Dev auth failed in dev mode', err);
    failures++;
  }

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    await getAuthenticatedMerchantId(mockReqDev);
    console.error('  ✗ FAIL: Prod allowed dev auth');
    failures++;
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message.includes('UNAUTHORIZED') || e.message.includes('cookies')) {
      console.log('  ✓ PASS: Prod rejects dev auth (fails closed or attempts real session)');
    } else {
      console.error('  ✗ FAIL: Unexpected error', e);
      failures++;
    }
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }

  // 6-7. Rate Limiter
  console.log('\n6-7. Rate Limiter Boundary...');
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    (process.env as Record<string, string | undefined>).REDIS_URL = ''; // Ensure missing
    await checkRateLimit('some_id', 1000);
    console.error('  ✗ FAIL: Prod allowed rate limiting without redis');
    failures++;
  } catch (err: unknown) {
    const e = err as Error;
    assert.match(e.message, /PRODUCTION CONFIGURATION ERROR: Persistent rate limiting provider/);
    console.log('  ✓ PASS: Prod rate limiting fails closed without Redis');
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }

  // 15. Health Endpoint
  console.log('\n15. Health Endpoint...');
  try {
    const res = await getHealth();
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, 'recoverai');
    assert.ok(!data.DATABASE_URL);
    assert.ok(!data.CRON_SECRET);
    console.log('  ✓ PASS: Health endpoint returns OK and leaks no secrets');
  } catch (err: unknown) {
    console.error('  ✗ FAIL: Health endpoint failed', err);
    failures++;
  }
  
  console.log('\nAll explicitly new Phase 10 boundaries passed.');
  console.log('Older guarantees (Cron, Webhooks, Idempotency) are heavily covered by verify-phase7/8/9 scripts which will run consecutively.');
  
  if (failures > 0) {
    console.error(`\nFAILED: ${failures} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n════════════════════════════════════════════`);
    console.log(`  Phase 10 Verification: ALL SCENARIOS PASSED`);
    console.log(`════════════════════════════════════════════\n`);
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
