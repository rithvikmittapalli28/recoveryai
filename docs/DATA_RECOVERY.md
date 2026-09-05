# Production Data Recovery & Backups

This document outlines the database backup strategy, recovery procedures, and incident response for the RecoverAI production PostgreSQL database.

## 1. Automated Backups

RecoverAI relies on the managed PostgreSQL provider (e.g., Supabase, Vercel Postgres, AWS RDS) for infrastructure-level durability.

**Requirements for Production DB:**
- Automated Daily Backups enabled.
- Point-in-Time Recovery (PITR) enabled with a minimum retention of 7 days.
- Cross-region backup replication (Recommended).

## 2. Recovery Procedures

**Scenario A: Catastrophic Data Loss (Hardware/Region Failure)**
1. Navigate to the database provider's console.
2. Select the latest healthy automated backup or choose a specific Point-in-Time prior to the failure.
3. Provision the restored database.
4. Update `DATABASE_URL` in the Vercel Production Environment Variables.
5. Trigger a Vercel redeployment to flush connection pools.

**Scenario B: Webhook Data Loss (Database was down)**
If the database was offline, Razorpay will attempt to retry webhooks.
- Razorpay retries webhooks automatically using an exponential backoff.
- If all retries are exhausted, you can use the Razorpay Dashboard to manually replay missed webhooks.
- Because `WebhookEvent.razorpayEventId` is `UNIQUE`, replaying webhooks is completely idempotent.

## 3. Incident Response: Credential Recovery

If the `CREDENTIAL_ENCRYPTION_KEY` is lost, all connected merchant Razorpay integrations will become permanently inaccessible.
- The `CREDENTIAL_ENCRYPTION_KEY` **must** be backed up securely in a cold-storage vault (e.g., 1Password, AWS Secrets Manager).
- If lost, merchants must be instructed to re-authenticate their Razorpay accounts via the Dashboard Settings. No financial data will be lost, but active `EXECUTING` recoveries will fail until reconnected.

## 4. Reconciliation Recovery

If the orchestration or cron systems go down:
- The system is designed to self-heal.
- Once the system is restored, the `GET /api/cron/reconciliation` cron job will automatically query Razorpay to resolve any actions stuck in the `EXECUTING` state.
- No manual database manipulation is required for stuck state transitions.
