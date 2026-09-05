import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!(await checkRateLimit(`login:${ip}`, 10))) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    const { merchantId, password } = await req.json();

    if (!merchantId || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const expectedPassword = process.env.DASHBOARD_PASSWORD;
    if (!expectedPassword || expectedPassword.length < 8) {
      console.error('[OBSERVABILITY] DASHBOARD_PASSWORD not configured or too short');
      return NextResponse.json({ error: 'System misconfigured' }, { status: 500 });
    }

    if (password !== expectedPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify merchant actually exists in DB
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const sessionPassword = process.env.SESSION_PASSWORD;
    if (!sessionPassword || sessionPassword.length < 32) {
      return NextResponse.json({ error: 'System misconfigured' }, { status: 500 });
    }

    const session = await getIronSession<{ merchantId?: string }>(await cookies(), {
      cookieName: "recoverai_session",
      password: sessionPassword,
      cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
      },
    });

    session.merchantId = merchant.id;
    await session.save();

    console.log(`[OBSERVABILITY] {"system":"auth","event":"login_success","merchantId":"${merchant.id}"}`);

    return NextResponse.json({ success: true, merchantId: merchant.id });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
