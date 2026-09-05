import { createRazorpayClient } from "./client";
import type { RazorpayConfig } from "@/lib/config/env";

export function createSubscriptionsService(config: RazorpayConfig) {
  const client = createRazorpayClient(config);

  return {
    async fetchSubscription(subscriptionId: string) {
      return client.subscriptions.fetch(subscriptionId);
    },
    // The official Node SDK does not have a direct fetchSubscriptionInvoices method on subscriptions API usually,
    // we use invoices API to fetch invoices for a subscription.
    async fetchSubscriptionInvoices(subscriptionId: string) {
      return client.invoices.all({ subscription_id: subscriptionId });
    }
  };
}
