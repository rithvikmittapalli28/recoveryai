import { createRazorpayClient } from "./client";
import type { RazorpayConfig } from "@/lib/config/env";

export function createOrdersService(config: RazorpayConfig) {
  const client = createRazorpayClient(config);

  return {
    async createOrder(params: Record<string, unknown>) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return client.orders.create(params as any);
    },
    async fetchOrder(orderId: string) {
      return client.orders.fetch(orderId);
    },
    async fetchPaymentsForOrder(orderId: string) {
      return client.orders.fetchPayments(orderId);
    },
  };
}
