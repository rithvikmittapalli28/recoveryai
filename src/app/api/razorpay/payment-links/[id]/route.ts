import { NextResponse } from "next/server";
import { getRazorpayConfig } from "@/lib/config/env";
import { createPaymentLinksService } from "@/integrations/razorpay/payment-links";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getRazorpayConfig();
  if (!config.ok) return NextResponse.json({ error: "Missing config" }, { status: 500 });

  const linkId = (await params).id;
  try {
    const service = createPaymentLinksService(config.value);
    const link = await service.fetchPaymentLink(linkId);
    return NextResponse.json(link);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
