import { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * PRODUCTION AUTHENTICATION ABSTRACTION
 * 
 * Rules:
 * - Never use CRON_SECRET for user sessions.
 * - In production, this uses iron-session.
 * - x-dev-merchant-id is strictly rejected in production.
 */
export async function getAuthenticatedMerchantId(req: NextRequest | Request): Promise<string> {
  const sessionPassword = process.env.SESSION_PASSWORD;

  if (process.env.NODE_ENV === 'production') {
    if (!sessionPassword || sessionPassword.length < 32) {
      console.error('[OBSERVABILITY] {"system":"auth","event":"auth_failed","reason":"invalid_session_password"}');
      throw new Error("UNAUTHORIZED: Production authentication is not configured. SESSION_PASSWORD must be >= 32 chars.");
    }

    const session = await getIronSession<{ merchantId?: string }>(await cookies(), {
      cookieName: "recoverai_session",
      password: sessionPassword,
      cookieOptions: {
        secure: true,
      },
    });

    if (!session.merchantId) {
      console.warn('[OBSERVABILITY] {"system":"auth","event":"auth_failed","reason":"missing_merchant_id"}');
      throw new Error("UNAUTHORIZED: No valid merchant session found.");
    }
    
    return session.merchantId;
  }

  // Development: allow passing merchant ID via header, cookie, default to merchant_test
  const merchantId = req.headers.get('x-dev-merchant-id') || req.headers.get('cookie')?.match(/dev_merchant_id=([^;]+)/)?.[1];
  if (merchantId) {
    return merchantId;
  }

  // Fallback to iron-session in dev if someone logged in
  if (sessionPassword && sessionPassword.length >= 32) {
     const session = await getIronSession<{ merchantId?: string }>(await cookies(), {
        cookieName: "recoverai_session",
        password: sessionPassword,
        cookieOptions: { secure: false },
     });
     if (session.merchantId) return session.merchantId;
  }

  return 'merchant_test';
}
