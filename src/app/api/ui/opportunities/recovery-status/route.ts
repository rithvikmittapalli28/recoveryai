import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthenticatedMerchantId } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/ui/opportunities/recovery-status
 *
 * Returns all opportunities and their associated recovery actions
 * that are in active or terminal financial states, for dashboard visibility.
 *
 * Status meanings shown in dashboard:
 *   EXECUTING       → Payment link is being created (reconciliation may be in progress)
 *   ACTION_EXECUTED → Payment link sent to customer, awaiting payment
 *   FAILED          → Execution failed; reconciliation confirmed no link was created
 *   RECOVERED       → Customer paid; confirmed via webhook
 *
 * SECURITY:
 * - Requires authenticated merchant session.
 * - Results are scoped strictly to the authenticated merchant.
 * - No financial parameters are accepted from the client.
 * - No Razorpay calls are made from this endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    const merchantId = await getAuthenticatedMerchantId(req);

    if (!(await checkRateLimit(`recovery-status:${merchantId}`, 2000))) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // Fetch opportunities in all post-approval states.
    // These are ordered by most-recently-updated first so the dashboard
    // shows the most recent activity at the top.
    const opportunities = await prisma.revenueOpportunity.findMany({
      where: {
        merchantId,
        status: {
          in: ['ACTION_EXECUTED', 'RECOVERED', 'FAILED'],
        },
      },
      include: {
        recoveryActions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    });

    // Also fetch EXECUTING actions separately — these come from the RecoveryAction table
    // since the opportunity status may lag during a crash window
    const executingActions = await prisma.recoveryAction.findMany({
      where: {
        status: 'EXECUTING',
        revenueOpportunity: { merchantId },
      },
      include: {
        revenueOpportunity: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const recoveryStatusItems = opportunities.map((opp) => {
      const action = opp.recoveryActions[0];
      return {
        opportunityId: opp.id,
        source: opp.source,
        amountSubunits: opp.amountSubunits,
        currency: opp.currency,
        opportunityStatus: opp.status,
        actionStatus: action?.status ?? null,
        // Display-friendly label for the dashboard
        displayStatus: opportunityDisplayStatus(opp.status, action?.status),
        razorpayPaymentLinkId: action?.razorpayPaymentLinkId ?? null,
        shortUrl: action?.shortUrl ?? null,
        updatedAt: opp.updatedAt,
        detectedAt: opp.detectedAt,
      };
    });

    const executingItems = executingActions
      .filter(
        // Exclude if opportunity already in recoveryStatusItems to avoid duplicates
        (ea) => !recoveryStatusItems.find((r) => r.opportunityId === ea.revenueOpportunityId)
      )
      .map((ea) => ({
        opportunityId: ea.revenueOpportunityId,
        source: ea.revenueOpportunity.source,
        amountSubunits: ea.revenueOpportunity.amountSubunits,
        currency: ea.revenueOpportunity.currency,
        opportunityStatus: ea.revenueOpportunity.status,
        actionStatus: 'EXECUTING',
        displayStatus: 'Executing — reconciliation may be in progress',
        razorpayPaymentLinkId: ea.razorpayPaymentLinkId ?? null,
        shortUrl: ea.shortUrl ?? null,
        updatedAt: ea.updatedAt,
        detectedAt: ea.revenueOpportunity.detectedAt,
      }));

    return NextResponse.json({
      items: [...executingItems, ...recoveryStatusItems],
      counts: {
        executing: executingItems.length,
        actionExecuted: recoveryStatusItems.filter((r) => r.opportunityStatus === 'ACTION_EXECUTED').length,
        failed: recoveryStatusItems.filter((r) => r.opportunityStatus === 'FAILED').length,
        recovered: recoveryStatusItems.filter((r) => r.opportunityStatus === 'RECOVERED').length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNAUTHORIZED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function opportunityDisplayStatus(opportunityStatus: string, actionStatus?: string): string {
  if (actionStatus === 'EXECUTING') {
    return 'Executing — reconciliation may be in progress';
  }
  switch (opportunityStatus) {
    case 'ACTION_EXECUTED':
      return 'Payment link sent — awaiting customer payment';
    case 'RECOVERED':
      return 'Recovered — customer paid';
    case 'FAILED':
      return 'Failed — execution could not be confirmed';
    default:
      return opportunityStatus;
  }
}
