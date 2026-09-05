import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createOrdersService } from "@/integrations/razorpay/orders";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  const orderId = (await params).id;
  try {
    const service = createOrdersService(config.value);
    const payments = await service.fetchPaymentsForOrder(orderId);
    return NextResponse.json(payments);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
