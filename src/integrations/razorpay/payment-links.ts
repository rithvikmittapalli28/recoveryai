import { createRazorpayClient } from "./client";
import type { RazorpayConfig } from "@/lib/config/env";

export function createPaymentLinksService(config: RazorpayConfig) {
  const client = createRazorpayClient(config);

  return {
    async createPaymentLink(params: Record<string, unknown>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return client.paymentLink.create(params as any);
    },
    async fetchPaymentLink(paymentLinkId: string) {
      return client.paymentLink.fetch(paymentLinkId);
    },
    async fetchPaymentLinks(params: Record<string, unknown> = {}) {
      return client.paymentLink.all(params);
    },
    async updatePaymentLink(paymentLinkId: string, params: Record<string, unknown>) {
      return client.paymentLink.edit(paymentLinkId, params);
    },
    async cancelPaymentLink(paymentLinkId: string) {
      return client.paymentLink.cancel(paymentLinkId);
    },
    async notifyPaymentLink(paymentLinkId: string, medium: 'sms' | 'email') {
      return client.paymentLink.notifyBy(paymentLinkId, medium);
    },
  };
}
