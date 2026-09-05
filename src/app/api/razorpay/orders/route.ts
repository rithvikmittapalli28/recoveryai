import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createOrdersService } from "@/integrations/razorpay/orders";

export async function POST(req: Request) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  try {
    const body = await req.json();
    const service = createOrdersService(config.value);
    const order = await service.createOrder(body);
    return NextResponse.json(order);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
