import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthenticatedMerchantId } from '@/lib/auth';
import { OpportunityStatus } from '@prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const merchantId = await getAuthenticatedMerchantId(req);

    if (!(await checkRateLimit(`metrics:${merchantId}`, 1000))) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    const pendingAgg = await prisma.revenueOpportunity.aggregate({
      where: {
        merchantId,
        status: OpportunityStatus.ACTION_PROPOSED,
      },
      _sum: { amountSubunits: true },
      _count: { id: true },
    });

    const recoveredAgg = await prisma.revenueOpportunity.aggregate({
      where: {
        merchantId,
        status: OpportunityStatus.RECOVERED,
      },
      _sum: { amountSubunits: true },
      _count: { id: true },
    });
    
    // To get expected recovery from actions, we sum RecoveryAction.expectedRecoveryValue
    const expectedRecoveryAgg = await prisma.recoveryAction.aggregate({
      where: {
        status: 'PENDING_APPROVAL',
        revenueOpportunity: {
          merchantId,
          status: OpportunityStatus.ACTION_PROPOSED
        }
      },
      _sum: { expectedRecoveryValue: true }
    });

    return NextResponse.json({
      atRiskRevenue: pendingAgg._sum.amountSubunits || 0,
      expectedRecovery: expectedRecoveryAgg._sum.expectedRecoveryValue || 0,
      verifiedRecovered: recoveredAgg._sum.amountSubunits || 0,
      pendingCount: pendingAgg._count.id || 0,
      recoveredCount: recoveredAgg._count.id || 0,
    });
  } catch (error: any /* eslint-disable-line */) {
    if (error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
