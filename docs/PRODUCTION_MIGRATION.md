# Production Migration Procedure

This document outlines the exact process for provisioning and migrating the RecoverAI PostgreSQL database to a live production environment.

## 1. Provisioning PostgreSQL
- Provision a PostgreSQL 15+ instance (e.g., Supabase, Neon, AWS RDS).
- Ensure the connection pooler (if any) supports transaction mode (e.g. PgBouncer in transaction mode is generally compatible with Prisma, but direct connections are safer for migrations).

## 2. Configuring DATABASE_URL
- Construct the `DATABASE_URL` string: `postgres://<user>:<password>@<host>:<port>/<dbname>?schema=public&sslmode=require`
- Store this securely in Vercel Environment Variables.
- Ensure the database user has DDL privileges for migrations.

## 3. Running Prisma Migrations
**NEVER run `npx prisma db push` in production.**
Instead, apply the deterministic migration history:

```bash
# During deployment or CI/CD
npx prisma migrate deploy
```

This ensures only trackable, safe migrations are applied sequentially.

## 4. Verifying Schema
- Review Vercel deployment logs to confirm `migrate deploy` executed successfully.
- Check the `_prisma_migrations` table in the database to verify the checksums and applied states.

## 5. Creating the First Merchant
Currently, merchant creation is a manual operational task or requires the `POST /api/onboarding/merchant` endpoint (if exposed).
- Insert a merchant record into the `Merchant` table.
- Generate a secure API session or trigger the standard onboarding flow.

## 6. Validating Merchant Credentials
- Provide the merchant with access to the onboarding UI.
- The merchant enters their Razorpay **TEST** credentials.
- The system encrypts them and writes to `MerchantCredential`.

## 7. Validating Database Connectivity
- Use the `/api/health` endpoint to verify the `APPLICATION` and `DATABASE` statuses return `healthy`.

## 8. Rollback Considerations
- Prisma does not support automatic down-migrations via CLI easily in production.
- If a migration corrupts data, restore from the automated backup (RDS/Supabase Point-in-Time Recovery).
- To roll back schema changes, write a new forward migration that reverts the structural changes and apply it using `prisma migrate deploy`.
