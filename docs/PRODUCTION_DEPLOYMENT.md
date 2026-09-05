# Production Deployment Checklist

This document contains the exact sequential checklist for a production deployment.
Currently, this outlines the theoretical cloud deployment workflow, as real deployment has not yet occurred.

## PRE-DEPLOYMENT

1. [ ] Create production PostgreSQL instance.
2. [ ] Create production Redis instance.
3. [ ] Configure Vercel environment variables (DATABASE_URL, REDIS_URL, OPENAI_API_KEY).
4. [ ] Verify `CREDENTIAL_ENCRYPTION_KEY` is a secure 32+ byte string.
5. [ ] Verify `SESSION_PASSWORD` is a secure 32+ byte string.
6. [ ] Verify `CRON_SECRET` is securely configured.
7. [ ] Verify OpenAI configuration is active.
8. [ ] Deploy application via Vercel GitHub integration or `vercel deploy --prod`.
9. [ ] Run migrations using `npx prisma migrate deploy` in the build step or a dedicated CI pipeline.
10. [ ] Verify `/api/health` returns HTTP 200 `healthy` (do not proceed if Degraded/Unhealthy).
11. [ ] Verify Iron-Session authentication is failing closed for invalid credentials.
12. [ ] Create first merchant using operational tools.
13. [ ] Connect Razorpay **TEST** credentials via the Dashboard.
14. [ ] Configure Razorpay **TEST** webhook URL in Razorpay Dashboard.
15. [ ] Verify webhook delivery by triggering a test event from Razorpay.
16. [ ] Verify orchestrator cron is functional via logs.
17. [ ] Verify reconciliation cron is functional via logs.
18. [ ] Verify dashboard loading.
19. [ ] Verify observability structured logs in Vercel.

## POST-DEPLOYMENT

20. [ ] Confirm cron execution loops regularly (15/30 min).
21. [ ] Confirm webhook delivery is successfully ingested (200 OK responses in Vercel edge logs).
22. [ ] Confirm Redis rate limiting is rejecting excessive requests.
23. [ ] Confirm logs are free of credentials or secrets.
24. [ ] Confirm database connection pool remains healthy under load.
25. [ ] Confirm Redis latency is within bounds.
26. [ ] Confirm AI processing is analyzing test events.
27. [ ] Confirm recovery workflow transitions (`PENDING_APPROVAL` -> `EXECUTING` -> `EXECUTED`).
28. [ ] Confirm reconciliation catches simulated stale actions.

## Deployment Status
**DEPLOYMENT READY — NOT YET DEPLOYED**
No actual cloud deployment has been performed from the local environment. All code and infrastructure invariants are deployment-ready.
