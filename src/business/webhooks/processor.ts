import { Prisma } from "@prisma/client";
import { prisma as db } from "@/lib/db/prisma";

export async function processWebhookEventBackground(
  eventId: string,
  event: string,
  payload: Record<string, unknown>
) {
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Map to FinancialEvent
      let entityId = null;
      let amountSubunits = null;
      let currency = null;
      let orderId = null;
      let paymentId = null;
      let paymentLinkId = null;
      let subscriptionId = null;
      let invoiceId = null;
      let disputeId = null;
      let refundId = null;
      let customerId = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyPayload = payload as any;
      const entityPayload = anyPayload.payload;

      if (event.startsWith("payment.dispute.")) {
        const dispute = entityPayload.dispute?.entity;
        if (dispute) {
          entityId = dispute.id;
          disputeId = dispute.id;
          paymentId = dispute.payment_id;
          amountSubunits = dispute.amount;
          currency = dispute.currency;
        }
      } else if (event.startsWith("payment.")) {
        const payment = entityPayload.payment?.entity;
        if (payment) {
          entityId = payment.id;
          paymentId = payment.id;
          amountSubunits = payment.amount;
          currency = payment.currency;
          orderId = payment.order_id;
          customerId = payment.customer_id;
        }
      } else if (event.startsWith("order.")) {
        const order = entityPayload.order?.entity;
        if (order) {
          entityId = order.id;
          orderId = order.id;
          amountSubunits = order.amount;
          currency = order.currency;
        }
      } else if (event.startsWith("payment_link.")) {
        const link = entityPayload.payment_link?.entity;
        if (link) {
          entityId = link.id;
          paymentLinkId = link.id;
          amountSubunits = link.amount;
          currency = link.currency;
          orderId = link.order_id;
          customerId = link.customer_id;
        }
      } else if (event.startsWith("subscription.")) {
        const sub = entityPayload.subscription?.entity;
        if (sub) {
          entityId = sub.id;
          subscriptionId = sub.id;
          customerId = sub.customer_id;
        }
      } else if (event.startsWith("refund.")) {
        const refund = entityPayload.refund?.entity;
        if (refund) {
          entityId = refund.id;
          refundId = refund.id;
          paymentId = refund.payment_id;
          amountSubunits = refund.amount;
          currency = refund.currency;
        }
      } else if (event.startsWith("invoice.")) {
        const invoice = entityPayload.invoice?.entity;
        if (invoice) {
          entityId = invoice.id;
          invoiceId = invoice.id;
          orderId = invoice.order_id;
          customerId = invoice.customer_id;
          subscriptionId = invoice.subscription_id;
          amountSubunits = invoice.amount;
          currency = invoice.currency;
        }
      }

      await tx.financialEvent.create({
        data: {
          merchantId: anyPayload.merchantId,
          eventType: event,
          source: "razorpay",
          sourceId: entityId || eventId,
          amountSubunits: amountSubunits,
          currency: currency,
          customerId: customerId,
          orderId: orderId,
          paymentId: paymentId,
          paymentLinkId: paymentLinkId,
          subscriptionId: subscriptionId,
          invoiceId: invoiceId,
          disputeId: disputeId,
          refundId: refundId,
          metadata: payload as Prisma.InputJsonValue,
          occurredAt: new Date((anyPayload.created_at || Math.floor(Date.now() / 1000)) * 1000),
        },
      });

      // 2. State-aware processing for Domain Models
      if (paymentId && event.startsWith("payment.")) {
        const newStatus = event.split(".")[1]; // authorized, captured, failed
        
        const existingPayment = await tx.payment.findFirst({
          where: { razorpayPaymentId: paymentId }
        });

        let shouldUpdate = true;
        if (existingPayment) {
          const hierarchy: Record<string, number> = { failed: 0, authorized: 1, captured: 2 };
          const currentLevel = hierarchy[existingPayment.status] ?? -1;
          const newLevel = hierarchy[newStatus] ?? -1;
          
          if (newLevel <= currentLevel && existingPayment.status !== newStatus) {
             shouldUpdate = false;
          }
        }

        if (shouldUpdate) {
           await tx.payment.updateMany({
             where: { razorpayPaymentId: paymentId },
             data: { status: newStatus }
           });
        }
      } else if (orderId && event.startsWith("order.")) {
        const newStatus = event.split(".")[1]; // paid
        await tx.order.updateMany({
          where: { razorpayOrderId: orderId },
          data: { status: newStatus }
        });
      } else if (paymentLinkId && event.startsWith("payment_link.")) {
        const newStatus = event.split(".")[1]; // paid, partially_paid, cancelled, expired
        
        const existingLink = await tx.paymentLink.findFirst({
          where: { razorpayPaymentLinkId: paymentLinkId }
        });

        let shouldUpdate = true;
        if (existingLink) {
          const hierarchy: Record<string, number> = { cancelled: 0, expired: 0, partially_paid: 1, paid: 2 };
          const currentLevel = hierarchy[existingLink.status] ?? -1;
          const newLevel = hierarchy[newStatus] ?? -1;
          
          if (newLevel <= currentLevel && existingLink.status !== newStatus) {
             shouldUpdate = false;
          }
        }

        if (shouldUpdate) {
          await tx.paymentLink.updateMany({
            where: { razorpayPaymentLinkId: paymentLinkId },
            data: { status: newStatus }
          });
        }
        
        // Phase 7: Webhook Reconciliation for RecoveryAction
        if (newStatus === 'paid') {
            const recoveryAction = await tx.recoveryAction.findFirst({
                where: { razorpayPaymentLinkId: paymentLinkId }
            });
            
            if (recoveryAction && recoveryAction.status !== 'RECOVERED') {
                console.log(`[OBSERVABILITY] Webhook reconciled RecoveryAction ${recoveryAction.id} to RECOVERED`);
                
                await tx.recoveryAction.update({
                    where: { id: recoveryAction.id },
                    data: { status: 'RECOVERED' }
                });
                
                // Keep Opportunity in sync
                await tx.revenueOpportunity.update({
                    where: { id: recoveryAction.revenueOpportunityId },
                    data: { status: 'RECOVERED' }
                });
            }
        }
      } else if (subscriptionId && event.startsWith("subscription.")) {
        const newStatus = event.split(".")[1]; // charged, halted, cancelled
        await tx.subscription.updateMany({
          where: { razorpaySubscriptionId: subscriptionId },
          data: { status: newStatus }
        });
      }
    });
  } catch (error) {
    console.error("Failed to process webhook event in background:", error);
  }
}
