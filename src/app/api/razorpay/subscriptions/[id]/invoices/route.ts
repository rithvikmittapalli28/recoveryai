import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createSubscriptionsService } from "@/integrations/razorpay/subscriptions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  const subId = (await params).id;
  try {
    const service = createSubscriptionsService(config.value);
    const invoices = await service.fetchSubscriptionInvoices(subId);
    return NextResponse.json(invoices);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
