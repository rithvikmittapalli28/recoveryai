# Production Domain Configuration

This document outlines the networking and domain requirements for a production Vercel deployment of RecoverAI.

## Custom Domain
- Configure your custom domain (e.g., `app.recoverai.com`) in the Vercel Project Settings.
- Alternatively, you can use the default `.vercel.app` domain for testing.
- **HTTPS is strictly required** for all interactions (Vercel provides this by default).

## DNS Requirements
- If using a custom domain, point your A record or CNAME to Vercel's edge network according to Vercel's Dashboard instructions.
- Ensure the domain propagates before configuring webhooks in Razorpay.

## Route Security & Exposure
- **Publicly Reachable Routes:**
  - `POST /api/webhooks/razorpay/[merchantId]` (Must be reachable by Razorpay servers. Protected by HMAC Signature).
- **Internal/Protected Routes:**
  - `GET /api/cron/orchestrator` (Protected by `Authorization: Bearer <CRON_SECRET>`).
  - `GET /api/cron/reconciliation` (Protected by `Authorization: Bearer <CRON_SECRET>`).
  - `GET /api/health` (Public, but redacts all secrets and PII).
- **Merchant Authenticated Routes:**
  - `POST /api/ui/actions/[id]/approve` (Requires valid Iron-Session cookie).
  - All other `/api/ui/*` endpoints.

## Authentication Requirements
- The `SESSION_PASSWORD` must be a 32+ character string.
- Vercel Cron jobs must pass the `CRON_SECRET` configured in Vercel's environment variables.
- Ensure strict separation between Development and Production variables (see Environment Separation).
