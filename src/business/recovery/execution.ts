import { prisma } from '../../lib/db/prisma';
import { createPaymentLinksService } from '../../integrations/razorpay/payment-links';
import { logger } from '../../lib/observability/logger';
import { metrics } from '../../lib/observability/metrics';

// Structured log helper - never logs secrets, keys, or PII
function executionLog(
  level: 'info' | 'warn' | 'error',
  actionId: string,
  message: string,
  detail: {
    previousStatus?: string;
    newStatus?: string;
    errorClass?: string;
    reason?: string;
  } = {}
) {
  const entry = {
    system: 'execution',
    actionId,
    message,
    ...detail,
  };
  if (level === 'error') {
    logger.error(message, entry);
  } else if (level === 'warn') {
    logger.warn(message, entry);
  } else {
    logger.info(message, entry);
  }
}

export async function approveAndExecuteAction(actionId: string) {
  metrics.increment('approval_requested_total');
  
  executionLog('info', actionId, 'Merchant approval received - attempting atomic claim', {
    previousStatus: 'PENDING_APPROVAL',
    newStatus: 'EXECUTING',
  });

  // 1. Atomically claim PENDING_APPROVAL -> EXECUTING
  const { count } = await prisma.recoveryAction.updateMany({
    where: { id: actionId, status: 'PENDING_APPROVAL' },
    data: { status: 'EXECUTING' },
  });

  if (count === 0) {
    metrics.increment('approval_failed_total', { reason: 'concurrent_claim' });
    executionLog('warn', actionId, 'Claim failed - action not in PENDING_APPROVAL state', {
      reason: 'concurrent_claim_or_invalid_state',
    });
    throw new Error('Action is not pending approval, already executed, or does not exist.');
  }

  metrics.increment('approval_succeeded_total');
  executionLog('info', actionId, 'Atomic claim succeeded - action is now EXECUTING', {
    previousStatus: 'PENDING_APPROVAL',
    newStatus: 'EXECUTING',
  });

  // 2. Fetch full action details
  const action = await prisma.recoveryAction.findUnique({
    where: { id: actionId },
    include: { revenueOpportunity: true },
  });

  if (!action) {
    throw new Error('Action not found after claim');
  }

  if (action.actionType === 'CREATE_PAYMENT_LINK') {
    let configResult: import('../../lib/config/env').RazorpayConfig;
    try {
      configResult = await import('../../lib/credentials/service').then(m => 
        m.getRazorpayConfigForMerchant(action.revenueOpportunity.merchantId)
      );
    } catch (err: unknown) {
      const e = err as Error;
      // Safe to revert here: we haven't called Razorpay yet so no double-charge risk
      await prisma.recoveryAction.update({
        where: { id: actionId },
        data: { status: 'PENDING_APPROVAL' },
      });
      metrics.increment('execution_failed_total', { reason: 'missing_config' });
      executionLog('error', actionId, 'Razorpay config missing - reverted to PENDING_APPROVAL', {
        previousStatus: 'EXECUTING',
        newStatus: 'PENDING_APPROVAL',
        errorClass: 'config_missing',
        reason: e.message,
      });
      throw new Error(`Missing Razorpay config: ${e.message}`);
    }

    try {
      metrics.increment('execution_started_total', { type: action.actionType });
      const paymentLinksService = createPaymentLinksService(configResult);

      executionLog('info', actionId, 'Calling Razorpay createPaymentLink', {
        previousStatus: 'EXECUTING',
        reason: `reference_id=${actionId}`,
      });

      const startTime = Date.now();
      const link = await paymentLinksService.createPaymentLink({
        amount: action.amountSubunits,
        currency: action.currency,
        description: `Recovery for Opportunity ${action.revenueOpportunityId}`,
        reference_id: action.id,
      });
      metrics.observe('razorpay_api_duration_ms', Date.now() - startTime, { endpoint: 'create_payment_link' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linkAny = link as any;

      executionLog('info', actionId, 'Razorpay createPaymentLink succeeded - writing EXECUTED to DB', {
        previousStatus: 'EXECUTING',
        newStatus: 'EXECUTED',
        reason: `razorpay_link_id=${linkAny.id}`,
      });

      // Write EXECUTED state + store payment link ID atomically
      await prisma.$transaction(async (tx) => {
        await tx.recoveryAction.update({
          where: { id: actionId },
          data: {
            status: 'EXECUTED',
            razorpayPaymentLinkId: linkAny.id,
            shortUrl: linkAny.short_url,
          },
        });

        await tx.revenueOpportunity.update({
          where: { id: action.revenueOpportunityId },
          data: { status: 'ACTION_EXECUTED' },
        });
      });

      metrics.increment('execution_succeeded_total', { type: action.actionType });
      executionLog('info', actionId, 'Action fully EXECUTED and opportunity updated', {
        previousStatus: 'EXECUTING',
        newStatus: 'EXECUTED',
      });

      return { success: true, url: linkAny.short_url };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('econnreset');
      const errorClass = isTimeout ? 'network_timeout' : 'razorpay_or_db_error';

      metrics.increment('execution_failed_total', { errorClass });
      executionLog('error', actionId, 'External execution failed - leaving EXECUTING for reconciliation', {
        previousStatus: 'EXECUTING',
        errorClass,
        reason: errorMessage,
      });

      throw new Error(
        'Failed to execute action externally. State remains EXECUTING for reconciliation.'
      );
    }
  }

  throw new Error(`Execution for action type ${action.actionType} is not supported.`);
}
