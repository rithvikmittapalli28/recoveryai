# RecoverAI Production Deployment Checklist

Use this strict checklist prior to any live deployment. 

## Infrastructure
- [ ] **PostgreSQL**: Configured securely, connection pooling enabled (`?pgbouncer=true`).
- [ ] **Redis**: Provisioned (e.g., Upstash) and accessible from the deployment environment.
- [ ] **Vercel**: Configured correctly with `vercel.json` cron mappings.
- [ ] **Environment Variables**: All required variables are injected into the production environment.

## Security
- [ ] **Authentication**: `iron-session` is utilizing a strong, generated `SESSION_PASSWORD` (>= 32 chars).
- [ ] **Session Security**: `secure: true` is enforced for cookies in production.
- [ ] **Cron Authentication**: `CRON_SECRET` is strong, >= 32 chars, and matches the Vercel cron caller exactly.
- [ ] **Webhook Authentication**: `RAZORPAY_WEBHOOK_SECRET` matches Razorpay dashboard exactly.
- [ ] **Razorpay Secrets**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are strictly `rzp_live_...` for production, and NEVER committed to source control.
- [ ] **OpenAI API Key**: Provided and appropriately billed.

## Application
- [ ] **Production Build**: `npm run build` executes cleanly with zero type or lint errors.
- [ ] **Database Migrations**: `npx prisma migrate deploy` executed successfully against production DB.
- [ ] **Cron Routes**: Verified working and successfully authenticating via `crypto.timingSafeEqual`.
- [ ] **Webhook Route**: Tested via Razorpay's "Test Webhook" dashboard feature.
- [ ] **Dashboard**: Pagination functions correctly; queries are correctly aggregated (no `findMany` memory leaks).
- [ ] **Health Endpoint**: `GET /api/health` returns `200 OK` and `database: "connected"` without leaking secrets.

## Financial Safety
- [ ] **Human Approval**: Verified absolutely mandatory. AI cannot create Payment Links.
- [ ] **Duplicate Execution**: Atomic concurrency locks (`count === 1` checks) are in place.
- [ ] **Webhook Idempotency**: Verified `razorpayEventId` is mapped uniquely in the DB.
- [ ] **Reconciliation is Read-Only**: Reconciliation engine marks stuck actions as `FAILED` but does NOT autonomously recreate Payment Links.
- [ ] **Test vs Live Separation**: `rzp_test_...` is completely eradicated from production environment settings.
