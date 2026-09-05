import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { runOrchestrator } from '@/business/orchestrator/engine';
import crypto from 'crypto';
import { logger, withLogContext } from '@/lib/observability/logger';
import { metrics } from '@/lib/observability/metrics';

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  metrics.increment('cron_orchestrator_invoked');

  return withLogContext({ requestId }, async () => {
    try {
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Orchestrator cron rejected', { reason: 'missing_authorization' });
        metrics.increment('cron_orchestrator_auth_failure');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const token = authHeader.split(' ')[1];
      const expectedSecret = process.env.CRON_SECRET || 'dev-secret';
      
      const expectedBuffer = Buffer.from(expectedSecret);
      const tokenBuffer = Buffer.from(token);

      if (expectedBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(expectedBuffer, tokenBuffer)) {
        logger.warn('Orchestrator cron rejected', { reason: 'invalid_cron_secret' });
        metrics.increment('cron_orchestrator_auth_failure');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const startTime = Date.now();
      logger.info('Starting orchestrator cron run');

      // Process all merchants sequentially (in a real app, this might be parallelized or batched)
      const merchants = await prisma.merchant.findMany({ select: { id: true } });
      
      const totalStats = { detected: 0, analyzed: 0, scored: 0, skipped: 0, failed: 0 };
      
      for (const m of merchants) {
        try {
          const stats = await runOrchestrator(m.id, { batchSize: 50 });
          totalStats.detected += stats.detected;
          totalStats.analyzed += stats.analyzed;
          totalStats.scored += stats.scored;
          totalStats.skipped += stats.skipped;
          totalStats.failed += stats.failed;
        } catch (err: unknown) {
          logger.error('Failed to process merchant in orchestrator', { 
            merchantId: m.id, 
            error: err instanceof Error ? err.message : String(err) 
          });
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info('Orchestrator cron complete', {
        merchantsProcessed: merchants.length,
        durationMs,
        stats: totalStats
      });
      metrics.observe('cron_orchestrator_duration_ms', durationMs);
      metrics.increment('cron_orchestrator_success');

      return NextResponse.json({
        success: true,
        merchantsProcessed: merchants.length,
        stats: totalStats
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      metrics.increment('cron_orchestrator_failure');
      logger.error('Cron orchestrator unhandled failure', { error: errorMessage });
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  });
}
