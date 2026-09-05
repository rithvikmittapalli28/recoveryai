import { createRazorpayClient } from "@/integrations/razorpay/client";
import type { RazorpayConfig } from "@/lib/config/env";

export type RazorpayConnectivityResult = {
  authenticated: boolean;
  checkedResource: "payments";
  recordsVisible: number;
};

export function createRazorpayService(config: RazorpayConfig) {
  const client = createRazorpayClient(config);

  return {
    async checkConnectivity(): Promise<RazorpayConnectivityResult> {
      const response = await client.payments.all({ count: 1 });

      return {
        authenticated: true,
        checkedResource: "payments",
        recordsVisible: response.count ?? 0,
      };
    },
  };
}
