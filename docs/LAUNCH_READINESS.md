# Launch Readiness Checklist

## SECURITY
- [x] **Authentication**: Iron-session enforced on all production routes.
- [x] **Authorization**: Merchant isolation enforced via `merchantId` scope in all queries.
- [x] **Tenant isolation**: Proven via Phase 13 and Phase 16 E2E tests.
- [x] **Credential encryption**: `aes-256-gcm` strictly applied to all Razorpay secrets.
- [x] **Secret management**: No secrets in `.env.example`, `.env` ignored, Vercel Env Vars utilized.
- [x] **Webhook verification**: HMAC SHA-256 signature validation strictly enforced.
- [x] **Cron authentication**: `CRON_SECRET` validation blocks unauthorized orchestration.
- [x] **Rate limiting**: Redis-backed distributed rate limiting enforced globally.

## INFRASTRUCTURE
- [x] **Vercel**: Edge/Node.js compatibility verified. Build succeeds. (Deployment: Pending Manual Execution).
- [x] **PostgreSQL**: Prisma migrations ready. Schema strict. (Provisioning: Pending Manual Execution).
- [x] **Redis**: Configured to fail-closed on connection drops.
- [x] **OpenAI**: Structured JSON outputs utilized successfully.
- [x] **Domain / HTTPS**: Managed by Vercel.

## RAZORPAY
- [x] **TEST validation**: All integration currently restricted to TEST keys ONLY.
- [x] **Webhook validation**: Idempotent processing of `payment_link.paid`.
- [x] **Reconciliation**: Automated fallback for missing webhooks verified.

## APPLICATION
- [x] **Dashboard**: Server-authoritative financial metrics.
- [x] **Inbox**: Priority sorted opportunity views.
- [x] **Approval**: Strict HITL requirement. AI cannot execute.
- [x] **Recovery**: Status transparency provided to merchants.
- [x] **Settings**: Secure credential onboarding UI.

## OPERATIONS
- [x] **Logs**: Custom structured JSON logger redact all sensitive fields.
- [x] **Monitoring**: High-cardinality metadata attached to events.
- [x] **Backups**: Procedure documented in `DATA_RECOVERY.md`.
- [x] **Runbooks**: Documented in `PRODUCTION_RUNBOOK.md`.
- [x] **Incident response**: Defined for integrations and infrastructure.

## FINAL CLASSIFICATION
**LAUNCH READY WITH LIMITATIONS**
(Awaiting manual provisioning of Vercel, PostgreSQL, and Redis cloud components).
