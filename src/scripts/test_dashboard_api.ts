/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config';
import { prisma as db } from '../lib/db/prisma';
import http from 'http';

function makeAPIRequest(method: string, path: string, merchantId: string): Promise<any> {
  return new Promise((resolve) => {
    const headers: any = { 'Content-Type': 'application/json', 'x-dev-merchant-id': merchantId };
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.end();
  });
}

function runOrchestrator(auth: string | null, merchantId: string): Promise<any> {
  return new Promise((resolve) => {
    const data = JSON.stringify({ merchantId });
    const headers: any = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (auth !== null) headers['authorization'] = auth;
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/orchestrator/run',
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.write(data);
    req.end();
  });
}

async function runTest() {
  console.log('--- Phase 5 UI API Test ---');
  let merchant = await db.merchant.findFirst();
  if (!merchant) {
    merchant = await db.merchant.create({ data: { name: 'E2E Merchant' } });
  }
  const orderId = 'ord_ui_test_' + Date.now();
  await db.order.create({
    data: {
      id: 'local_' + orderId,
      merchantId: merchant.id,
      razorpayOrderId: orderId,
      amountSubunits: 10000,
      currency: 'INR',
      status: 'created',
      createdAt: new Date(Date.now() - 40 * 60000),
    }
  });

  await db.financialEvent.create({
    data: {
      merchantId: merchant.id,
      eventType: 'payment.failed',
      sourceId: 'pay_fail_' + Date.now(),
      orderId: orderId,
      amountSubunits: 10000,
      currency: 'INR',
      metadata: { error: { reason: 'insufficient_funds' } },
      occurredAt: new Date()
    }
  });

  console.log('Triggering Orchestrator...');
  await runOrchestrator('Bearer ' + (process.env.CRON_SECRET || 'dev-secret'), merchant.id);
  console.log('Orchestrator finished.');

  console.log('Testing /api/ui/dashboard/metrics');
  const metrics = await makeAPIRequest('GET', '/api/ui/dashboard/metrics', merchant.id);
  console.log('Metrics status:', metrics.status);
  console.log('Metrics body:', metrics.body);

  console.log('Testing /api/ui/opportunities/pending');
  const pending = await makeAPIRequest('GET', '/api/ui/opportunities/pending', merchant.id);
  console.log('Pending status:', pending.status);
  const pendingBody = JSON.parse(pending.body);
  console.log('Found pending opportunities:', pendingBody?.length);

  if (pendingBody?.length > 0) {
    const opp = pendingBody.find((o: any) => o.recommendedAction === 'CREATE_PAYMENT_LINK') || pendingBody[0];
    const actionId = opp.actionId;
    console.log('Approving action', actionId);
    
    const approve = await makeAPIRequest('POST', `/api/ui/actions/${actionId}/approve`, merchant.id);
    console.log('Approve status:', approve.status);
    console.log('Approve result:', approve.body);
  }
}

runTest().catch(console.error);
