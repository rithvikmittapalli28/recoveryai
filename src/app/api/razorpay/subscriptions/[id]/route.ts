import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createSubscriptionsService } from "@/integrations/razorpay/subscriptions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  const subId = (await params).id;
  try {
    const service = createSubscriptionsService(config.value);
    const sub = await service.fetchSubscription(subId);
    return NextResponse.json(sub);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
