# Razorpay Production Architecture & Setup

## Architecture Overview
RecoverAI utilizes strict **Multi-Tenant Razorpay Isolation**.
The application does not use global Razorpay API keys.
Instead, when a merchant acts:
1. `MerchantCredential` is fetched for the specific `merchantId`.
2. AES-256-GCM decrypts the credential strictly in memory.
3. An isolated Razorpay Client instance is initialized for that exact request.

## TEST MODE vs LIVE MODE
**Currently, the entire application is strictly in TEST MODE.**
- Do NOT provision live Razorpay keys.
- Do NOT attempt to collect real payments.
- When configuring webhooks in Razorpay, ensure you are in the **Test Mode** dashboard.

## Webhook Deployment
**Route:** `POST /api/webhooks/razorpay/[merchantId]`

### Configuration Steps
1. Log in to the Razorpay Dashboard (Test Mode).
2. Go to **Settings > Webhooks > Add New Webhook**.
3. Set the Webhook URL to: `https://[YOUR_VERCEL_DOMAIN]/api/webhooks/razorpay/[MERCHANT_UUID]`
4. **Secret:** Generate a strong, random 32+ character string.
5. **Events Required:**
   - `payment.authorized`, `payment.captured`, `payment.failed`
   - `order.paid`
   - `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled`, `payment_link.expired`
   - `subscription.charged`, `subscription.halted`, `subscription.cancelled`
6. Click Save.
7. The merchant must securely enter this same webhook secret into the RecoverAI Onboarding Dashboard so it can be encrypted and saved in `MerchantCredential`.

### Verification & Idempotency
- Incoming webhooks use the `[merchantId]` parameter to fetch the corresponding tenant's decrypted webhook secret.
- HMAC SHA-256 signature verification is performed using the raw HTTP request body.
- `x-razorpay-event-id` is stored in the `WebhookEvent` table to guarantee exactly-once processing (idempotency against replay attacks).
