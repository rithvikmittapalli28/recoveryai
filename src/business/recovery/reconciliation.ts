import { prisma } from '../../lib/db/prisma';
import { createPaymentLinksService } from '../../integrations/razorpay/payment-links';
import { logger } from '../../lib/observability/logger';
import { metrics } from '../../lib/observability/metrics';

const timeoutEnv = process.env.RECOVERY_RECONCILIATION_TIMEOUT_MINUTES;
const parsedTimeout = timeoutEnv ? parseInt(timeoutEnv, 10) : 5;
const RECOVERY_EXECUTION_TIMEOUT_MINUTES = (!isNaN(parsedTimeout) && parsedTimeout > 0 && parsedTimeout <= 1440) 
  ? parsedTimeout 
  : 5;

// Structured log helper - never logs secrets, keys, or PII
function reconciliationLog(
  level: 'info' | 'warn' | 'error',
  actionId: string,
  message: string,
  detail: {
    previousStatus?: string;
    newStatus?: string;
    reason?: string;
    razorpayResult?: string;
    errorClass?: string;
    timestamp?: string;
  } = {}
) {
  const entry = {
    system: 'reconciliation',
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

export interface ReconciliationResult {
  stuckFound: number;
  reconciledToExecuted: number;
  reconciledToFailed: number;
  skipped: number;
  errors: number;
}

export async function reconcileStuckActions(): Promise<ReconciliationResult> {
  const timeoutThreshold = new Date(
    Date.now() - RECOVERY_EXECUTION_TIMEOUT_MINUTES * 60 * 1000
  );

  // Only find genuinely stale EXECUTING actions — all other statuses are excluded at query level
  const stuckActions = await prisma.recoveryAction.findMany({
    where: {
      status: 'EXECUTING',
      updatedAt: { lt: timeoutThreshold },
    },
    include: {
      revenueOpportunity: true,
    },
  });

  let reconciledToExecuted = 0;
  let reconciledToFailed = 0;
  let skipped = 0;
  let errors = 0;

  for (const action of stuckActions) {
    reconciliationLog('info', action.id, 'Candidate stale EXECUTING action found', {
      previousStatus: 'EXECUTING',
      reason: `updatedAt threshold: ${timeoutThreshold.toISOString()}`,
    });

    // Defence-in-depth: even though the query filters to EXECUTING, guard explicitly.
    // This protects against any concurrent update that happened between query and loop.
    if (action.status !== 'EXECUTING') {
      reconciliationLog('warn', action.id, 'Skipping — action status is no longer EXECUTING (race condition)', {
        previousStatus: action.status,
        reason: 'defence_in_depth_guard',
      });
      skipped++;
      continue;
    }

    // SAFETY: NEVER reconcile PENDING_APPROVAL, CANCELLED, FAILED, or RECOVERED actions.
    // These are terminal or human-gated states. This is a belt-and-suspenders check.
    const safeStatuses = ['PENDING_APPROVAL', 'CANCELLED', 'FAILED', 'RECOVERED', 'EXECUTED'];
    if (safeStatuses.includes(action.status)) {
      reconciliationLog('warn', action.id, 'Skipping — action is in a protected terminal state', {
        previousStatus: action.status,
        reason: 'terminal_state_guard',
      });
      skipped++;
      continue;
    }

    try {
      let configResult: import('../../lib/config/env').RazorpayConfig;
      try {
        configResult = await import('../../lib/credentials/service').then(m => 
          m.getRazorpayConfigForMerchant(action.revenueOpportunity.merchantId)
        );
      } catch (err: unknown) {
        const e = err as Error;
        reconciliationLog('error', action.id, 'Skipping - Razorpay config missing', {
          previousStatus: 'EXECUTING',
          errorClass: 'config_missing',
          reason: e.message,
        });
        skipped++;
        continue;
      }

      // --- ATOMIC CONCURRENCY LOCK ---
      // Attempt to claim this action for reconciliation by confirming it is still EXECUTING.
      // If a concurrent worker already claimed it, count will be 0 and we skip safely.
      const { count: claimed } = await prisma.recoveryAction.updateMany({
        where: { id: action.id, status: 'EXECUTING' },
        data: { updatedAt: new Date() }, // Touch updatedAt to extend the "in progress" window
      });

      if (claimed === 0) {
        reconciliationLog('info', action.id, 'Skipping — concurrently claimed by another reconciliation worker', {
          previousStatus: 'EXECUTING',
          reason: 'concurrent_claim_missed',
        });
        skipped++;
        continue;
      }

      const paymentLinksService = createPaymentLinksService(configResult);

      // --- READ-ONLY Razorpay lookup using reference_id = action.id ---
      // This is the ONLY external call in reconciliation. It never creates a Payment Link.
      let linksResult: unknown;
      try {
        linksResult = await paymentLinksService.fetchPaymentLinks({
          reference_id: action.id,
        });
      } catch (networkErr: unknown) {
        // Uncertain outcome — could be a transient network error or timeout.
        // We MUST NOT mark this FAILED because the Payment Link might exist on Razorpay's side.
        // Leave state as EXECUTING; the next cron run will retry the lookup.
        const errorMessage = networkErr instanceof Error ? networkErr.message : String(networkErr);
        reconciliationLog('error', action.id, 'Razorpay lookup failed — leaving EXECUTING for next run', {
          previousStatus: 'EXECUTING',
          errorClass: 'network_uncertain',
          reason: errorMessage,
        });
        errors++;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const links: unknown[] = (linksResult as any)?.payment_links
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? (linksResult as any)?.items
        ?? [];

      if (links.length > 0) {
        // Payment Link WAS created in Razorpay. Reconcile to EXECUTED.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const link = links[0] as any;

        reconciliationLog('info', action.id, 'Razorpay Payment Link found — reconciling to EXECUTED', {
          previousStatus: 'EXECUTING',
          newStatus: 'EXECUTED',
          razorpayResult: `payment_link_found:${link.id}`,
          reason: 'crash_window_recovery',
        });

        await prisma.$transaction(async (tx) => {
          // Atomic: only update if still EXECUTING (belt-and-suspenders against another concurrent reconciler)
          const { count } = await tx.recoveryAction.updateMany({
            where: { id: action.id, status: 'EXECUTING' },
            data: {
              status: 'EXECUTED',
              razorpayPaymentLinkId: link.id,
              shortUrl: link.short_url,
              metadata: {
                ...(typeof action.metadata === 'object' && action.metadata ? action.metadata : {}),
                reconciledAt: new Date().toISOString(),
                reconciliationReason: 'crash_window_recovery',
              },
            },
          });

          if (count > 0) {
            await tx.revenueOpportunity.update({
              where: { id: action.revenueOpportunityId },
              data: { status: 'ACTION_EXECUTED' },
            });
          }
        });

        reconciledToExecuted++;
      } else {
        // No Payment Link exists in Razorpay for this reference_id.
        // This is a confirmed failure: the external call never succeeded.
        // Safe to mark FAILED. Reconciliation does NOT create a new link.
        reconciliationLog('info', action.id, 'No Razorpay Payment Link found — reconciling to FAILED', {
          previousStatus: 'EXECUTING',
          newStatus: 'FAILED',
          razorpayResult: 'payment_link_not_found',
          reason: 'execution_never_reached_razorpay',
        });

        await prisma.$transaction(async (tx) => {
          const { count } = await tx.recoveryAction.updateMany({
            where: { id: action.id, status: 'EXECUTING' },
            data: {
              status: 'FAILED',
              metadata: {
                ...(typeof action.metadata === 'object' && action.metadata ? action.metadata : {}),
                reconciledAt: new Date().toISOString(),
                reconciliationNote: 'Razorpay Payment Link was never created. Action marked FAILED.',
              },
            },
          });

          // Opportunity stays in ACTION_PROPOSED so merchant can still see it.
          // We do NOT automatically re-run the opportunity through the pipeline.
          if (count === 0) {
            reconciliationLog('warn', action.id, 'FAILED update had count=0 — already updated by concurrent worker', {
              reason: 'concurrent_worker_race',
            });
          }
        });

        reconciledToFailed++;
      }
    } catch (err: unknown) {
      // Catch-all for unexpected errors (e.g., DB write failure after Razorpay call).
      // Do NOT change action state — leave EXECUTING so the next cron run can retry.
      const errorMessage = err instanceof Error ? err.message : String(err);
      reconciliationLog('error', action.id, 'Unexpected reconciliation error — leaving EXECUTING', {
        previousStatus: 'EXECUTING',
        errorClass: 'unexpected_error',
        reason: errorMessage,
      });
      errors++;
    }
  }

  metrics.observe('reconciliation_actions_scanned_total', stuckActions.length);
  metrics.observe('reconciliation_actions_recovered_total', reconciledToExecuted);
  metrics.observe('reconciliation_actions_failed_total', reconciledToFailed);
  metrics.observe('reconciliation_uncertain_total', skipped); // Some skipped are uncertain / concurrent
  metrics.observe('reconciliation_errors_total', errors);
  
  if (stuckActions.length > 0) {
    logger.info('Reconciliation batch complete', {
      system: 'reconciliation',
      actionId: 'batch',
      reason: `found=${stuckActions.length} executed=${reconciledToExecuted} failed=${reconciledToFailed} skipped=${skipped} errors=${errors}`
    });
  }

  return {
    stuckFound: stuckActions.length,
    reconciledToExecuted,
    reconciledToFailed,
    skipped,
    errors,
  };
}
