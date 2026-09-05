import Razorpay from "razorpay";

import type { RazorpayConfig } from "@/lib/config/env";

export function createRazorpayClient(config: RazorpayConfig) {
  return new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });
}
