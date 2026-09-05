/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config';
import { prisma as db } from '../lib/db/prisma';
import { approveAndExecuteAction } from '../business/recovery/execution';
import http from 'http';
import crypto from 'crypto';

process.env.MOCK_AI = 'true';

function makeRequest(auth: string | null, merchantId: string): Promise<any> {
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

function simulateWebhook(eventBody: any, signature: string): Promise<any> {
  return new Promise((resolve) => {
    const data = JSON.stringify(eventBody);
    const headers: any = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (signature) headers['x-razorpay-signature'] = signature;
    headers['x-razorpay-event-id'] = 'ev_' + Date.now();
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhooks/razorpay',
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

async function runE2E() {
  console.log('--- E2E Manual Audit ---');
  let merchant = await db.merchant.findFirst();
  if (!merchant) {
    merchant = await db.merchant.create({ data: { name: 'E2E Merchant' } });
  }

  // 1. Precedence test
  const orderId = 'ord_prec_test_' + Date.now();
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
  const res = await makeRequest('Bearer ' + (process.env.CRON_SECRET || 'dev-secret'), merchant.id);
  console.log('Orchestrator Result:', res.status, res.body);
  
  const opps = await db.revenueOpportunity.findMany({
    where: { merchantId: merchant.id, orderId },
    include: { recoveryActions: true }
  });
  
  console.log('Opps created for order:', opps.length);
  const pfOpp = opps.find(o => o.source === 'PAYMENT_FAILURE');
  const abOpp = opps.find(o => o.source === 'CHECKOUT_ABANDONMENT');
  console.log('Payment Failure Opp exists:', !!pfOpp);
  console.log('Abandonment Opp exists:', !!abOpp);
  
  if (pfOpp) {
    console.log('Opp Status:', pfOpp.status);
    console.log('Recovery Action created:', pfOpp.recoveryActions.length > 0);
    
    if (pfOpp.recoveryActions.length > 0) {
      const action = pfOpp.recoveryActions[0];
      console.log('Action Status:', action.status);
      console.log('Executing HIL manually...');
      try {
        await approveAndExecuteAction(action.id);
        const updatedAction = await db.recoveryAction.findUnique({ where: { id: action.id }});
        console.log('Executed Action Status:', updatedAction?.status);
        
        const metadata = updatedAction?.metadata as any;
        console.log('Razorpay ID attached:', metadata?.razorpay_payment_link_id ? 'Yes' : 'No');
        
        console.log('Simulating successful payment link webhook...');
        const rzpLinkId = metadata?.razorpay_payment_link_id;
        
        const payload = {
          event: 'payment_link.paid',
          payload: {
            payment_link: {
              entity: {
                id: rzpLinkId,
                status: 'paid',
                amount_paid: 10000,
                order_id: orderId
              }
            }
          }
        };
        const stringPayload = JSON.stringify(payload);
        const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
          .update(stringPayload).digest('hex');
          
        const hookRes = await simulateWebhook(payload, signature);
        console.log('Webhook Result:', hookRes.status, hookRes.body);
        
        const finalOpp = await db.revenueOpportunity.findUnique({ where: { id: pfOpp.id }});
        console.log('Final Opp Status:', finalOpp?.status);
        
      } catch (err: any) {
        console.error('Execution Failed:', err.message);
      }
    }
  }

}

runE2E().catch(console.error);
