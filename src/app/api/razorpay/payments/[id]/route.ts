import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createPaymentsService } from "@/integrations/razorpay/payments";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  const paymentId = (await params).id;
  try {
    const service = createPaymentsService(config.value);
    const payment = await service.fetchPayment(paymentId);
    return NextResponse.json(payment);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
