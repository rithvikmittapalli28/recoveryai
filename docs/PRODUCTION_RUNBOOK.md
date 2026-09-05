# RecoverAI Production Runbook

This runbook describes symptom identification, safe actions, and escalation conditions for production incidents.

## 1. Application Outage (Vercel)
- **Symptoms:** 502/504 errors on all routes, UI fails to load.
- **Checks:** Vercel Status page, Vercel Edge Logs for deployment failures.
- **Safe Action:** Trigger a manual rollback to the last successful deployment via Vercel Dashboard.
- **Escalation:** If Vercel is experiencing a regional outage, notify merchants of downtime.

## 2. Database Outage (PostgreSQL)
- **Symptoms:** 500 errors on API routes, Prisma `P1001` or `P2024` connection timeouts in logs.
- **Checks:** Database provider metrics (CPU, RAM, Connections).
- **Safe Action:** Scale up database connection limits. Restart application to flush connection pools.
- **Escalation:** If data corruption is suspected, initiate Point-in-Time Recovery (PITR) per `DATA_RECOVERY.md`.

## 3. Redis Outage
- **Symptoms:** Rate limit errors (429) uniformly, or Redis connection errors in logs.
- **Checks:** Redis provider metrics.
- **Safe Action:** Application is designed to fail-closed on Redis failure to prevent abuse. Wait for provider resolution.
- **Escalation:** If Redis data is lost, no permanent damage occurs (rate limit counters reset).

## 4. OpenAI Outage
- **Symptoms:** Opportunities remain in `PROCESSING` state indefinitely. AI Scoring API returns 500s.
- **Checks:** OpenAI Status page.
- **Safe Action:** Do nothing. The orchestrator cron will automatically retry `PROCESSING` opportunities on its next cycle.
- **Escalation:** If prolonged, merchants may manually review opportunities if manual workflows are built, or wait for AI resolution.

## 5. Razorpay Outage
- **Symptoms:** `EXECUTING` actions get stuck. Webhooks stop arriving.
- **Checks:** Razorpay Status page.
- **Safe Action:** Do nothing. Razorpay will queue webhooks. The reconciliation cron will eventually pick up stuck `EXECUTING` states once the API recovers.
- **Escalation:** Check Razorpay dashboard manually for status of payment links.

## 6. Webhook Failure / Duplicate Webhook
- **Symptoms:** Merchants report payments completed but UI shows `EXECUTING`.
- **Checks:** Search logs for `webhook_signature_invalid` or `unique_constraint_violation` on `WebhookEvent`.
- **Safe Action:** The system idempotently rejects duplicate `razorpayEventId`. If a webhook is missed, the reconciliation cron will resolve it.

## 7. Stuck EXECUTING Action
- **Symptoms:** Action is `EXECUTING` for > 30 minutes.
- **Checks:** Run `GET /api/cron/reconciliation`. Check logs for `reconciled_action` events.
- **Safe Action:** Wait for the reconciliation cron, which runs hourly.

## 8. Credential Encryption Failure
- **Symptoms:** Merchants cannot view Razorpay integration, API throws Decryption Errors.
- **Checks:** Ensure `CREDENTIAL_ENCRYPTION_KEY` has not been rotated or lost in Vercel env vars.
- **Safe Action:** Restore original `CREDENTIAL_ENCRYPTION_KEY`.
- **Escalation:** If lost, mandate all merchants to re-authenticate via the dashboard.
