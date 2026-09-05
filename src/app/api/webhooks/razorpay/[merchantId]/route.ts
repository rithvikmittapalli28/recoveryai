/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma as db } from "@/lib/db/prisma";
import { processWebhookEventBackground } from "@/business/webhooks/processor";
import { logger, withLogContext } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

export async function POST(req: Request, { params }: { params: Promise<{ merchantId: string }> | { merchantId: string } }) {
  const requestId = crypto.randomUUID();
  metrics.increment('webhook_received_total');
  
  return withLogContext({ requestId }, async () => {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get("x-razorpay-signature");
      const eventId = req.headers.get("x-razorpay-event-id");

      if (!signature || !eventId) {
        metrics.increment('webhook_rejected_total', { reason: 'missing_headers' });
        return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
      }

      // Await params to handle both Next.js 14 and 15 (Next 15 makes it a Promise)
      const resolvedParams = await params;
      const merchantId = resolvedParams.merchantId;

      logger.info('Webhook received', { merchantId, eventId });

      // Fetch the merchant credential
      let config;
      try {
        config = await import("@/lib/credentials/service").then(m => m.getRazorpayConfigForMerchant(merchantId));
      } catch (e: unknown) {
        metrics.increment('webhook_rejected_total', { reason: 'invalid_merchant' });
        return NextResponse.json({ error: "Invalid merchant or missing configuration" }, { status: 404 });
      }

      if (!config.webhookSecret) {
        metrics.increment('webhook_rejected_total', { reason: 'missing_secret' });
        return NextResponse.json({ error: "Webhook secret not configured for this merchant" }, { status: 400 });
      }

      // 1. Signature Validation using raw body and specific merchant secret
      const expectedSignature = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSignature) {
        logger.warn('Webhook signature invalid', { merchantId, eventId });
        metrics.increment('webhook_rejected_total', { reason: 'invalid_signature' });
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      // 2. Idempotency Check using WebhookEvent
      const existingEvent = await db.webhookEvent.findUnique({
        where: { razorpayEventId: eventId },
      });

      if (existingEvent) {
        logger.info('Webhook duplicate ignored', { merchantId, eventId });
        metrics.increment('webhook_duplicate_total');
        return NextResponse.json({ status: "skipped", reason: "duplicate" }, { status: 200 });
      }

      // Parse payload after signature validation
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch (_e) {
        metrics.increment('webhook_rejected_total', { reason: 'invalid_json' });
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
      
      // Inject the isolated merchantId into the payload so processor knows which merchant it belongs to
      if (!payload.merchantId) {
         payload.merchantId = merchantId;
      }

      const event = payload.event;
      
      const supportedEvents = [
        "payment.authorized", "payment.captured", "payment.failed",
        "order.paid",
        "payment_link.paid", "payment_link.partially_paid", "payment_link.cancelled", "payment_link.expired",
        "subscription.charged", "subscription.halted", "subscription.cancelled"
      ];

      if (!supportedEvents.includes(event)) {
        return NextResponse.json({ status: "ignored", reason: "unsupported event" }, { status: 200 });
      }

      // 3. Webhook Replay / Age Check
      const eventCreatedAt = payload.created_at ? payload.created_at * 1000 : null;
      if (eventCreatedAt && (Date.now() - eventCreatedAt > 24 * 60 * 60 * 1000)) {
        logger.warn('Webhook event is unusually old', {
           eventId, merchantId, eventCreatedAt: new Date(eventCreatedAt).toISOString()
        });
      }

      // 4. Ingestion (Separate from processing)
      await db.webhookEvent.create({
        data: {
          razorpayEventId: eventId,
          event: event,
          payload: payload,
          processed: true, // marked true as it will be processed immediately after
        },
      });

      // 5. Asynchronous Processing (Return 200 promptly)
      metrics.increment('webhook_processed_total', { event });
      
      const startProcess = Date.now();
      processWebhookEventBackground(eventId, event, payload).then(() => {
         metrics.observe('webhook_processing_duration_ms', Date.now() - startProcess, { event });
      }).catch(error => {
         metrics.increment('webhook_failed_total');
         logger.error('Failed to process webhook event asynchronously', {
           eventId, merchantId, event, error: error instanceof Error ? error.message : String(error)
         });
      });

      logger.info('Webhook successfully ingested', { merchantId, eventId, event });
      return NextResponse.json({ status: "processed" }, { status: 200 });
    } catch (error: unknown) {
      metrics.increment('webhook_failed_total');
      logger.error('Webhook processing unhandled error', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  });
}
