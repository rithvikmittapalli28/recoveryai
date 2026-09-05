import { GET as orchestratorGet } from '../app/api/cron/orchestrator/route';
import { GET as reconciliationGet } from '../app/api/cron/reconciliation/route';
import { NextRequest } from 'next/server';

async function testCronEndpoint(name: string, handler: any) {
  console.log(`\nTesting ${name}`);
  
  // 1. Missing Authorization
  const req1 = new NextRequest('http://localhost/api/cron', { headers: {} });
  const res1 = await handler(req1);
  console.log(`Missing Auth Status: ${res1.status}`);

  // 2. Invalid Authorization
  const req2 = new NextRequest('http://localhost/api/cron', { headers: { authorization: 'Bearer invalid' } });
  const res2 = await handler(req2);
  console.log(`Invalid Auth Status: ${res2.status}`);

  // 3. Correct Authorization
  const req3 = new NextRequest('http://localhost/api/cron', { headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'dev-secret'}` } });
  const res3 = await handler(req3);
  console.log(`Valid Auth Status: ${res3.status}`);
}

async function main() {
  await testCronEndpoint('Orchestrator', orchestratorGet);
  await testCronEndpoint('Reconciliation', reconciliationGet);
}

main().catch(console.error);
