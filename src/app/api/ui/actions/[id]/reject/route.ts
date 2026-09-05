import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthenticatedMerchantId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const merchantId = await getAuthenticatedMerchantId(req);
    const { id: actionId } = await params;

    if (!(await checkRateLimit(`reject:${merchantId}`, 2000))) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    // Load action server-side to verify ownership
    const action = await prisma.recoveryAction.findUnique({
      where: { id: actionId },
      include: { revenueOpportunity: true }
    });

    if (!action) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    if (action.revenueOpportunity.merchantId !== merchantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action.status !== 'PENDING_APPROVAL' || action.revenueOpportunity.status !== 'ACTION_PROPOSED') {
      return NextResponse.json({ error: 'Invalid state for rejection' }, { status: 400 });
    }

    // Reject via state-machine only
    await prisma.$transaction(async (tx) => {
      await tx.recoveryAction.update({
        where: { id: action.id },
        data: { status: 'CANCELLED' }
      });
      
      await tx.revenueOpportunity.update({
        where: { id: action.revenueOpportunityId },
        data: { status: 'DECLINED' }
      });
    });

    console.log(`[OBSERVABILITY] {"system":"ui","event":"action_rejected","actionId":"${actionId}","merchantId":"${merchantId}"}`);

    return NextResponse.json({ success: true, status: 'CANCELLED' });
  } catch (error: any /* eslint-disable-line */) {
    if (error.message && error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error(`[OBSERVABILITY] {"system":"ui","event":"rejection_failed","error":"${error.message}"}`);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}