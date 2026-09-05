import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/business/orchestrator/engine';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'dev-secret'}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { merchantId } = await req.json();

    if (!merchantId) {
      return NextResponse.json({ error: 'Missing merchantId' }, { status: 400 });
    }

    const stats = await runOrchestrator(merchantId);

    return NextResponse.json({ success: true, stats }, { status: 200 });
  } catch (error: unknown) {
    console.error('Orchestrator run failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
