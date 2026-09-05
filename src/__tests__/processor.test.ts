/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { processWebhookEventBackground } from "../business/webhooks/processor";
import { prisma as db } from "../lib/db/prisma";

describe("Webhook Processor Mappings", () => {
  it("should correctly map refund events", async () => {
    let capturedData: any = null;
    const originalTx = db.$transaction;
    
    // 
    db.$transaction = (async (callback: any) => {
      const txMock = new Proxy({ financialEvent: { create: async ({ data }: any) => { capturedData = data; } } }, { get(target: any, prop: string) { if (prop in target) return target[prop]; return new Proxy({}, { get() { return async () => null; } }); } });
      await callback(txMock);
    }) as any;

    await processWebhookEventBackground("evt_1", "refund.created", {
      created_at: 1000,
      payload: {
        refund: {
          entity: {
            id: "ref_123",
            payment_id: "pay_123",
            amount: 500,
            currency: "INR"
          }
        }
      }
    });

    assert.ok(capturedData);
    assert.strictEqual(capturedData.eventType, "refund.created");
    assert.strictEqual(capturedData.sourceId, "ref_123");
    assert.strictEqual(capturedData.refundId, "ref_123");
    assert.strictEqual(capturedData.paymentId, "pay_123");
    assert.strictEqual(capturedData.amountSubunits, 500);
    
    // 
    db.$transaction = originalTx as any;
  });

  it("should correctly map dispute events", async () => {
    let capturedData: any = null;
    const originalTx = db.$transaction;
    
    // 
    db.$transaction = (async (callback: any) => {
      const txMock = new Proxy({ financialEvent: { create: async ({ data }: any) => { capturedData = data; } } }, { get(target: any, prop: string) { if (prop in target) return target[prop]; return new Proxy({}, { get() { return async () => null; } }); } });
      await callback(txMock);
    }) as any;

    await processWebhookEventBackground("evt_2", "payment.dispute.created", {
      created_at: 1000,
      payload: {
        dispute: {
          entity: {
            id: "disp_123",
            payment_id: "pay_123",
            amount: 500,
            currency: "INR"
          }
        }
      }
    });

    assert.ok(capturedData);
    assert.strictEqual(capturedData.eventType, "payment.dispute.created");
    assert.strictEqual(capturedData.sourceId, "disp_123");
    assert.strictEqual(capturedData.disputeId, "disp_123");
    assert.strictEqual(capturedData.paymentId, "pay_123");
    
    // 
    db.$transaction = originalTx as any;
  });

  it("should correctly map invoice events", async () => {
    let capturedData: any = null;
    const originalTx = db.$transaction;
    
    // 
    db.$transaction = (async (callback: any) => {
      const txMock = new Proxy({ financialEvent: { create: async ({ data }: any) => { capturedData = data; } } }, { get(target: any, prop: string) { if (prop in target) return target[prop]; return new Proxy({}, { get() { return async () => null; } }); } });
      await callback(txMock);
    }) as any;

    await processWebhookEventBackground("evt_3", "invoice.payment_failed", {
      created_at: 1000,
      payload: {
        invoice: {
          entity: {
            id: "inv_123",
            order_id: "order_123",
            customer_id: "cust_123",
            subscription_id: "sub_123",
            amount: 500,
            currency: "INR"
          }
        }
      }
    });

    assert.ok(capturedData);
    assert.strictEqual(capturedData.eventType, "invoice.payment_failed");
    assert.strictEqual(capturedData.sourceId, "inv_123");
    assert.strictEqual(capturedData.invoiceId, "inv_123");
    assert.strictEqual(capturedData.orderId, "order_123");
    assert.strictEqual(capturedData.subscriptionId, "sub_123");
    
    // 
    db.$transaction = originalTx as any;
  });
});

