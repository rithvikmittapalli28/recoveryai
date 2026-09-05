# RecoverAI

RecoverAI is a production-quality foundation for a Razorpay AI Buildathon Track 03 project: AI Revenue Recovery.

The product vision is an AI-powered revenue recovery platform for merchants. It will detect revenue at risk, diagnose why it is at risk, estimate recovery potential, prioritize cases, choose bounded recovery actions, execute supported actions through Razorpay APIs, verify outcomes, and measure actual recovered revenue.

This repository currently contains only the application foundation. Payment recovery, checkout abandonment recovery, agent orchestration, and leakage detection are intentionally not implemented yet.

## Architecture

- `src/app` - Next.js App Router pages and server-side API routes.
- `src/components/ui` - shared UI building blocks for the dashboard.
- `src/integrations/razorpay` - isolated server-side Razorpay SDK setup and services.
- `src/lib/config` - environment variable parsing and runtime configuration helpers.
- `src/lib/db` - Prisma client singleton.
- `src/lib/logging` - logging foundation.
- `src/ai` - future bounded AI agent logic.
- `src/business` - future domain services and revenue recovery use cases.
- `src/validation` - Zod schemas shared by routes and services.
- `src/utils` - small framework-neutral helpers.
- `prisma/schema.prisma` - PostgreSQL models and initial domain schema.
- `prisma.config.ts` - Prisma 7 datasource and migration configuration.

## Why Razorpay is central to RecoverAI

Razorpay isn't just a payment processor here; it is the source of truth for revenue states. Our future AI agents rely on a structured, normalized flow of Razorpay events. The lifecycle for recovering revenue is deeply integrated:
**Orders → Payments → Webhooks → Payment Links → Recovery → Verification**

1. A checkout issue happens (Order/Payment fails).
2. Razorpay Webhooks emit events (e.g., `payment.failed`).
3. RecoverAI intercepts these, stores them idempotently in `WebhookEvent`, and normalizes them into `FinancialEvent`.
4. A `RevenueOpportunity` is detected.
5. The AI decides a recovery strategy, utilizing Razorpay Payment Links.
6. The customer pays the link, triggering new Webhooks (`payment_link.paid`) which update the opportunity status automatically.

## Razorpay Integration & Integrated APIs

The system encapsulates all Razorpay SDK usage within the `src/integrations/razorpay/` directory, exposing specific service methods. This allows future AI tools to safely invoke these bounded operations.

Currently Integrated APIs and their purposes:
- **Orders API**: (`create`, `fetch`, `fetchPayments`) - Used to create test checkouts and verify their subsequent payment flows.
- **Payments API**: (`fetch`, `all`) - Used to inspect payment statuses and failure reasons.
- **Payment Links API**: (`create`, `fetch`, `all`, `edit`, `cancel`, `notifyBy`) - A critical mechanism for future abandoned checkout recovery. We can send customers a direct link to complete a failed transaction.
- **Subscriptions API**: (`fetch`, `invoices.all`) - Used to monitor recurring revenue leakage and fetch associated invoices.

### Webhook Setup

A single endpoint `/api/webhooks/razorpay` handles real-time synchronization with Razorpay. 
It securely validates the HMAC SHA256 signature against the raw request body.

Supported Events:
- `payment.authorized`, `payment.captured`, `payment.failed`
- `order.paid`
- `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`
- `subscription.charged`, `subscription.halted`, `subscription.cancelled`

*Webhook idempotency is guaranteed by tracking the `x-razorpay-event-id` header in the `WebhookEvent` model.*

## Environment Variables & Test Mode

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Configure these values:

- `DATABASE_URL` - PostgreSQL connection string for Prisma.
- `RAZORPAY_KEY_ID` - Razorpay API key ID. **MUST be a Test Mode key** (e.g., `rzp_test_...`).
- `RAZORPAY_KEY_SECRET` - Razorpay API key secret.
- `RAZORPAY_WEBHOOK_SECRET` - Razorpay webhook signing secret.
- `AI_PROVIDER_API_KEY` - placeholder for a future AI provider key.

**Security**: Never commit `.env` or real credentials. Secrets are never logged or exposed to the client browser.

## Real vs Simulated Data

We enforce a strict distinction between real Razorpay records and simulated data for safe testing.
Models like `FinancialEvent` and `RevenueOpportunity` have an `isSimulated` flag. Never present simulated data as authentic Razorpay data.

## Local Development

Install dependencies:
```bash
npm install
```

Generate the Prisma client:
```bash
npm run prisma:generate
```

Run database migrations after PostgreSQL is available and `DATABASE_URL` is configured:
```bash
npm run prisma:migrate
```

Start the development server:
```bash
npm run dev
```

### Development Endpoints

Minimal routes to test the Razorpay integration directly:
- `GET /api/health`
- `GET /api/razorpay/connectivity`
- `POST /api/razorpay/orders`
- `GET /api/razorpay/orders/[id]`
- `GET /api/razorpay/orders/[id]/payments`
- `GET /api/razorpay/payments/[id]`
- `POST /api/razorpay/payment-links`
- `GET /api/razorpay/payment-links/[id]`
- `GET /api/razorpay/subscriptions/[id]`
- `GET /api/razorpay/subscriptions/[id]/invoices`

## Verification

Use these checks before submitting changes:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
