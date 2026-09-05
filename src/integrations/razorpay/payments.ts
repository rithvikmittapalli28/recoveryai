import { createRazorpayClient } from "./client";
import type { RazorpayConfig } from "@/lib/config/env";

export function createPaymentsService(config: RazorpayConfig) {
  const client = createRazorpayClient(config);

  return {
    async fetchPayment(paymentId: string) {
      return client.payments.fetch(paymentId);
    },
    async fetchPayments(params: Record<string, unknown> = {}) {
      return client.payments.all(params);
    },
  };
}
