import { NextResponse } from "next/server";

import { createRazorpayService } from "@/integrations/razorpay/service";
import { getRazorpayConfig } from "@/lib/config/env";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET() {
  const config = getRazorpayConfig();

  if (!config.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Razorpay credentials are not configured.",
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  try {
    const razorpay = createRazorpayService(config.value);
    const result = await razorpay.checkConnectivity();

    return NextResponse.json({
      ok: true,
      provider: "razorpay",
      mode: config.value.keyId.startsWith("rzp_test_") ? "test" : "live",
      result,
    });
  } catch (error) {
    logger.error("Razorpay connectivity check failed", { error });

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unable to authenticate with Razorpay using the configured credentials.",
      },
      { status: 502 },
    );
  }
}
