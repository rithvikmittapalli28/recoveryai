# Production Smoke Test Procedure

After deploying the infrastructure, run this manual end-to-end smoke test to verify system integrity before handling real customer transactions. **Do NOT use real money.**

## 1. Verify Health (No Auth Required)
Navigate to `https://[YOUR_VERCEL_DOMAIN]/api/health`
**Expected:** 
```json
{ "status": "healthy", "database": "healthy", "redis": "healthy" }
```

## 2. Authenticate
Execute a login via the frontend (or manual API call to set the `recoverai_session` cookie).
**Expected:** Session cookie is set and is `Secure` and `HttpOnly`.

## 3. Onboarding & Razorpay TEST
1. Navigate to the Merchant Dashboard.
2. Enter your Razorpay **TEST** Mode `Key ID` and `Key Secret`.
3. Provide the Webhook Secret you configured in Razorpay.
4. Submit.
**Expected:** The credentials save successfully. Database inspection will show they are AES-256-GCM encrypted in the `MerchantCredential` table.

## 4. Trigger Webhook
1. Go to your Razorpay Dashboard (Test Mode).
2. Create a test Payment Link or invoice, and force a failure or payment.
3. Observe the webhook payload hitting Vercel logs (`/api/webhooks/razorpay/[merchantId]`).
**Expected:** Vercel logs show `200 OK`. `WebhookEvent` table contains a new processed event.

## 5. Opportunity & AI Scoring
1. Wait up to 15 minutes, or manually trigger the Vercel Orchestrator Cron `GET /api/cron/orchestrator` with `Authorization: Bearer <CRON_SECRET>`.
2. Navigate to the Dashboard Pending Opportunities view.
**Expected:** The webhook failure was detected, evaluated by OpenAI, assigned a `priorityScore`, and is now in `PENDING_APPROVAL` status.

## 6. Human Approval & TEST Execution
1. Click **Approve** on the proposed recovery action in the dashboard.
2. The UI calls `/api/ui/actions/[id]/approve`.
**Expected:** Status changes to `EXECUTING`. A real Razorpay TEST Mode Payment Link is created.

## 7. Recovery Confirmation
1. In the Razorpay Dashboard, find the newly created Test Payment Link and mark it as Paid.
2. Razorpay sends the `payment_link.paid` webhook.
**Expected:** The opportunity is automatically updated to `RECOVERED`.

## 8. Reconciliation
1. Wait up to 30 minutes, or manually trigger the Vercel Reconciliation Cron `GET /api/cron/reconciliation`.
**Expected:** Any actions stuck in `EXECUTING` that weren't resolved by webhooks are actively fetched from Razorpay and synced to `EXECUTED` or `FAILED`.

## 9. Observability Verification
1. Open Vercel Logs.
**Expected:** JSON structured logs exist. **Zero** raw credentials, secrets, passwords, or Authorization headers appear in the output.

**If all steps pass, the platform is verified and operating safely.**
