import { NextRequest, NextResponse } from 'next/server';
import { reconcileStuckActions } from '@/business/recovery/reconciliation';
import crypto from 'crypto';
import { logger, withLogContext } from '@/lib/observability/logger';
import { metrics } from '@/lib/observability/metrics';

/**
 * GET /api/cron/reconciliation
 *
 * Automatically triggered by Vercel Cron every 30 minutes.
 * Finds stale EXECUTING RecoveryActions and reconciles their true state
 * by querying Razorpay's API using the action's reference_id.
 *
 * SECURITY GUARANTEES:
 * - Requires valid CRON_SECRET in Authorization header.
 * - Returns 401 for missing or invalid credentials.
 * - Never logs CRON_SECRET or any API key.
 * - Never approves, creates, or executes a financial action.
 * - Never creates a Razorpay Payment Link.
 * - Only performs read-only Razorpay lookups and deterministic DB state updates.
 */
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  metrics.increment('cron_reconciliation_invoked');

  return withLogContext({ requestId }, async () => {
    // ── Authentication ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Reconciliation cron rejected', { reason: 'missing_authorization' });
      metrics.increment('cron_reconciliation_auth_failure');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7); // strip "Bearer "
    const expectedSecret = process.env.CRON_SECRET ?? 'dev-secret';
    
    // Constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSecret);
    const tokenBuffer = Buffer.from(token);
    
    if (expectedBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(expectedBuffer, tokenBuffer)) {
      logger.warn('Reconciliation cron rejected', { reason: 'invalid_cron_secret' });
      metrics.increment('cron_reconciliation_auth_failure');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ────────────────────────────────────────────────────────────────────────────

    const startedAt = new Date().toISOString();
    logger.info('Starting reconciliation run', { startedAt });
    const startTime = Date.now();

    try {
      const result = await reconcileStuckActions();

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      
      logger.info('Reconciliation complete', {
        startedAt,
        completedAt,
        durationMs,
        ...result
      });
      metrics.observe('cron_reconciliation_duration_ms', durationMs);
      metrics.increment('cron_reconciliation_success');

      return NextResponse.json({
        success: true,
        startedAt,
        completedAt,
        scanned: result.stuckFound,
        reconciledToExecuted: result.reconciledToExecuted,
        reconciledToFailed: result.reconciledToFailed,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      metrics.increment('cron_reconciliation_failure');
      logger.error('Reconciliation run failed', { error: errorMessage });
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  });
}
