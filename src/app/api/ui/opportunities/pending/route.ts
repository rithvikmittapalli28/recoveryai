import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthenticatedMerchantId } from '@/lib/auth';
import { OpportunityStatus } from '@prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  try {
    const merchantId = await getAuthenticatedMerchantId(req);

    if (!(await checkRateLimit(`pending:${merchantId}`, 1000))) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const pendingOpps = await prisma.revenueOpportunity.findMany({
      where: {
        merchantId,
        status: OpportunityStatus.ACTION_PROPOSED,
      },
      include: {
        recoveryActions: {
          where: { status: 'PENDING_APPROVAL' },
          
        },
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit,
    });

    // Flatten to return actionable opportunities
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionable = (pendingOpps as any[])
      .filter(opp => opp.recoveryActions.length > 0)
      .map(opp => {
        const action = opp.recoveryActions[0];
        return {
          id: opp.id,
          actionId: action.id,
          type: opp.source,
          sourceId: opp.sourceId,
          amountSubunits: opp.amountSubunits,
          currency: opp.currency,
          expectedRecoveryValue: action.expectedRecoveryValue,
          priorityScore: opp.priorityScore,
          recoveryProbability: action.recoveryProbability,
          recommendedAction: action.actionType,
          reasoning: action.aiReasoning,
          evidence: opp.metadata,
          detectedAt: opp.createdAt,
        };
      })
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

    return NextResponse.json(actionable);
  } catch (error: any /* eslint-disable-line */) {
    if (error.message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
