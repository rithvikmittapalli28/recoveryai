# Redis Production Readiness

## Configuration
- `REDIS_URL` must be provided as a secure Vercel environment variable (e.g. Upstash Redis).
- `RATE_LIMIT_PROVIDER` should be set to `redis` to explicitly bypass the in-memory fallback.
- The Redis instance must be accessible from Vercel's serverless edge/lambda functions.

## Connection Requirements
- Use an SSL-secured connection (`rediss://`).
- Use connection pooling or serverless HTTP integrations (Upstash REST API is preferred for serverless via `@upstash/redis`, but the standard `ioredis` works over standard TCP with TLS).

## Failure Behavior
- If Redis is unavailable or the connection times out, the rate-limiting system fails **CLOSED**.
- The `rate-limit.ts` logic traps connection errors and throws a strict `RATE_LIMIT_ERROR`.
- **No in-memory fallback is used in production.** In development, an LRU cache is used, but in production, missing Redis strictly prevents authenticated financial actions (such as approvals) to prevent abuse and brute force.

## Operational Considerations
- Monitor Redis memory usage to ensure rate limiting counters do not evict other necessary operational state (if shared).
- Standard rate limit TTLs are short-lived (e.g. 60 seconds).
- Redis errors are bubbled up to the structured observability logs as `REDIS_ERROR`.
