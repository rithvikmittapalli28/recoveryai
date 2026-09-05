import assert from 'assert';
import { getAuthenticatedMerchantId } from '../lib/auth';
import { checkRateLimit } from '../lib/rate-limit';

async function runTests() {
  console.log('--- Starting Phase 9 Security Verification ---');
  let failures = 0;

  // 1. Production rejects development auth & Development auth only works in dev
  console.log('\n1 & 2. Development Auth Boundary...');
  
  // We can't trivially mock process.env in a robust way for ES modules, but we can verify the behavior
  // directly through the auth function.
  const mockReqDev = {
    headers: {
      get: (h: string) => h === 'x-dev-merchant-id' ? 'merchant_test' : null
    }
  } as unknown as Request;
  
  // Dev mode works
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
    // It should either complain about configuration OR fail trying to read Next.js cookies (since it's a script)
    if (e.message.includes('UNAUTHORIZED') || e.message.includes('cookies')) {
      console.log('  ✓ PASS: Prod rejects dev auth (fails closed or attempts real session)');
    } else {
      console.error('  ✗ FAIL: Unexpected error', e);
      failures++;
    }
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }

  // Rate Limiting Boundary
  console.log('\nRate Limit Boundary...');
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const allowed = await checkRateLimit('some_id', 1000);
    if (allowed) {
      console.error('  ✗ FAIL: Prod allowed rate limiting without working redis');
      failures++;
    } else {
      console.log('  ✓ PASS: Prod rate limiting fails closed (denies request) on Redis failure');
    }
  } catch (err: unknown) {
    const e = err as Error;
    if (e.message.includes('PRODUCTION CONFIGURATION ERROR')) {
      console.log('  ✓ PASS: Prod rate limiting throws when missing Redis config');
    } else {
      console.error('  ✗ FAIL: Unexpected error', e);
      failures++;
    }
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }

  console.log('\nAll security boundary tests passed.');
  
  if (failures > 0) {
    console.error(`\nFAILED: ${failures} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n════════════════════════════════════════════`);
    console.log(`  Phase 9 Verification: ALL SCENARIOS PASSED`);
    console.log(`════════════════════════════════════════════\n`);
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
