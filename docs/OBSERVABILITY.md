# Observability & Monitoring

This document outlines the operational visibility architecture for RecoverAI (introduced in Phase 14). 

## 1. Structured Logging
All logs are structured JSON, emitted to `stdout`/`stderr` via `src/lib/observability/logger.ts`.
Do NOT use raw `console.log`.

**Features:**
- Automatic secret redaction (`authorization`, `password`, `key`, `secret`, `signature`).
- `AsyncLocalStorage` based `requestId` propagation (`withLogContext`).
- Strict tenant isolation tracking (`merchantId`, `opportunityId`, `actionId`).

## 2. Metrics Abstraction
`src/lib/observability/metrics.ts` provides a serverless-friendly metrics interface.
Currently, metrics are emitted as structured logs (`metric_increment`, `metric_observe`). 

## 3. Webhook Observability
Tracked metrics:
- `webhook_received_total`
- `webhook_rejected_total`
- `webhook_duplicate_total`
- `webhook_processed_total`
- `webhook_failed_total`
- `webhook_processing_duration_ms`

## 4. AI & Orchestrator Observability
Tracked metrics:
- `ai_analysis_succeeded_total`
- `ai_analysis_failed_total`
- `ai_scoring_duration_ms`
- `ai_scoring_total`
- `ai_scoring_failure_total`
- `cron_orchestrator_invoked`, `cron_orchestrator_success`, `cron_orchestrator_failure`

## 5. Recovery Execution Observability
Logs cover every state transition (`PENDING_APPROVAL` -> `EXECUTING` -> `EXECUTED`).
Tracked metrics:
- `approval_requested_total`
- `approval_failed_total`
- `approval_succeeded_total`
- `execution_started_total`
- `execution_succeeded_total`
- `execution_failed_total`
- `razorpay_api_duration_ms`

## 6. Reconciliation Observability
Reconciliation crons emit detailed batch statistics:
- `reconciliation_actions_scanned_total`
- `reconciliation_actions_recovered_total`
- `reconciliation_actions_failed_total`
- `reconciliation_uncertain_total`
- `reconciliation_errors_total`

## 7. Error Categories
System errors are categorized using `ErrorCodes` to aid troubleshooting:
- `AUTHENTICATION_ERROR`
- `AUTHORIZATION_ERROR`
- `VALIDATION_ERROR`
- `DATABASE_ERROR`
- `REDIS_ERROR`
- `RAZORPAY_ERROR`
- `WEBHOOK_SIGNATURE_ERROR`
- `WEBHOOK_DUPLICATE`
- `AI_ERROR`
- `SCORING_ERROR`
- `RECONCILIATION_ERROR`
- `RATE_LIMIT_ERROR`
- `CONFIGURATION_ERROR`

## Troubleshooting Guide

**"Webhook failures increasing"**
- Check `webhook_rejected_total` to see if signatures are failing (could be rotated secret).
- Check `webhook_failed_total` for DB timeout/errors during asynchronous ingestion.

**"Actions stuck EXECUTING"**
- Inspect `reconciliation_actions_scanned_total` to ensure cron is running.
- If `reconciliation_uncertain_total` is high, Razorpay API may be rate-limiting or timing out on fetch.
- Verify merchant has configured valid Razorpay credentials.

**"AI opportunities stuck PROCESSING"**
- Inspect `ai_analysis_failed_total` or `ai_scoring_failure_total`.
- Check OpenAI API connectivity.
- Verify `cron_orchestrator_failure` is not spiking.
