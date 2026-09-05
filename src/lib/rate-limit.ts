import Redis from 'ioredis';

// In-memory fallback for development only
const rateLimitMap = new Map<string, number>();

let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false
  });
  redisClient.on('error', (err) => {
    console.error('[OBSERVABILITY] {"system":"rate-limit","message":"Redis error","error":"' + err.message + '"}');
  });
}

/**
 * PRODUCTION RATE LIMITING ABSTRACTION
 * 
 * Production requires a persistent store like Redis.
 */
export async function checkRateLimit(merchantId: string, limitMs: number = 2000): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') {
    if (!redisClient || !process.env.REDIS_URL) {
      console.error('[OBSERVABILITY] {"system":"rate-limit","event":"config_error","reason":"missing_redis_url"}');
      throw new Error("PRODUCTION CONFIGURATION ERROR: Persistent rate limiting provider (e.g. Redis) is not configured.");
    }
    
    const key = `ratelimit:${merchantId}`;
    try {
      // SET key value PX limitMs NX
      // Returns 'OK' if set (allowed), null if exists (rate limited)
      const result = await redisClient.set(key, '1', 'PX', limitMs, 'NX');
      if (result !== 'OK') {
        console.warn(`[OBSERVABILITY] {"system":"rate-limit","event":"rate_limited","merchantId":"${merchantId}"}`);
      }
      return result === 'OK';
    } catch (err) {
      // Fail closed on Redis error in production
      console.error('[OBSERVABILITY] {"system":"rate-limit","message":"Redis set error","error":"' + (err instanceof Error ? err.message : String(err)) + '"}');
      return false; 
    }
  }
  
  // Development fallback
  const now = Date.now();
  const lastRequest = rateLimitMap.get(merchantId) || 0;
  
  if (now - lastRequest < limitMs) {
    return false; // Rate limit exceeded
  }
  
  rateLimitMap.set(merchantId, now);
  return true; // Allowed
}
