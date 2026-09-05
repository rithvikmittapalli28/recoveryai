import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createPaymentLinksService } from "@/integrations/razorpay/payment-links";

export async function POST(req: Request) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  try {
    const body = await req.json();
    const service = createPaymentLinksService(config.value);
    const link = await service.createPaymentLink(body);
    return NextResponse.json(link);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
