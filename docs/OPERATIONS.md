# RecoverAI Operations & Monitoring Guide

## 1. Traceability & Logs
RecoverAI utilizes structured JSON logging in production to ensure observability without leaking secrets or PII.

Look for lines prefixed with `[OBSERVABILITY]` in your Vercel/Datadog logs.

### Key Log Events to Monitor
- **Authentication**:
  - `{"system":"auth","event":"auth_failed"}`: Look for spikes which could indicate credential stuffing or configuration drift.
- **Rate Limiting**:
  - `{"system":"rate-limit","event":"rate_limited","merchantId":"..."}`: Monitoring these identifies abusive actors or frontend loop bugs.
  - `{"system":"rate-limit","event":"config_error"}`: Indicates a critical Redis downtime event.
- **Execution Workflow**:
  - `{"system":"execution","actionId":"...","message":"Calling Razorpay createPaymentLink"}`
  - `{"system":"execution","actionId":"...","message":"Claim failed — action not in PENDING_APPROVAL state"}`: Normal concurrency collision handling.
- **Reconciliation**:
  - `{"system":"reconciliation","actionId":"...","message":"Candidate stale EXECUTING action found"}`: Tracks actions that crashed mid-flight.
  - `{"system":"reconciliation","message":"Reconciliation batch complete"}`: Shows cron throughput.

## 2. Investigating Specific Failures

### AI / OpenAI Failures
If AI scoring fails, the orchestrator safely skips the opportunity for that batch.
- **Logs**: Search for `{"system":"orchestrator","message":"Failed to score opportunity"}` or OpenAI API exceptions.
- **Action**: Check OpenAI rate limits or billing. The orchestrator will automatically retry the opportunity on the next cron run because it remains in `OPEN` state.

### Razorpay Failures
- **Logs**: Search for `{"system":"execution","message":"Execution failed"}`.
- **Action**: If Razorpay fails during `createPaymentLink` (e.g. invalid customer details, rate limit), the action is caught by the reconciliation engine and eventually marked as `FAILED`.

### Stuck EXECUTING Actions
- **Condition**: An action stuck in `EXECUTING` means the process crashed after acquiring the atomic DB lock but before writing the Razorpay link ID back to the database.
- **Action**: The `/api/cron/reconciliation` job will automatically find these after `RECOVERY_RECONCILIATION_TIMEOUT_MINUTES`. If the link was successfully created at Razorpay, it requires manual manual link sync, but by default it fails closed to `FAILED` so the merchant can safely propose a new action.

### Webhook Failures
- **Condition**: Duplicate webhooks are silently ignored via `PrismaClientKnownRequestError` on the unique `razorpayEventId` constraint.
- **Logs**: Search for `Webhook processing error`. Invalid signatures throw explicitly.
- **Action**: Use Razorpay dashboard to replay missing webhooks.

### Redis Failures
- **Condition**: If Redis goes down, `checkRateLimit` fails closed. The app denies all state-mutating requests (Approve/Reject/Dashboard) with `500` or `429`.
- **Action**: Fix Upstash/Redis configuration.

### Cron Failures
- **Condition**: The orchestrator/reconciliation jobs can timeout if processing takes >10s on Vercel Hobby or >60s on Pro.
- **Action**: Both engines use batching (`take: 50`) and atomic locks. If a cron crashes, the next cron simply picks up where it left off. No manual intervention is needed for half-processed batches.

## 3. Recovery State Lifecycle Monitoring
To monitor system health, inspect the distribution of `RevenueOpportunity` and `RecoveryAction` states in the DB.

### Healthy Flow:
`OPEN` -> (AI Analysis) -> `ACTION_PROPOSED` -> (Merchant) -> `EXECUTING` -> (Razorpay) -> `EXECUTED` -> (Webhook) -> `RECOVERED`

### Terminal Non-Recovered States:
- `DECLINED`: The merchant explicitly rejected the action.
- `FAILED`: Razorpay creation failed, or the process crashed mid-flight and was reconciled.
- `CANCELLED`: The link expired or was cancelled by the merchant on Razorpay.

**Note:** There is intentionally NO automatic "retry" button. If an action is `FAILED`, it must go back through the AI detection pipeline to ensure the deterministic state is still valid.
