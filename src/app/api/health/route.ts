import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "recoverai",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[OBSERVABILITY] {"system":"health","message":"Database ping failed"}', error);
    return NextResponse.json({
      ok: false,
      service: "recoverai",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
