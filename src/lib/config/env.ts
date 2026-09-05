import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: nonEmptyString.optional(),
  RAZORPAY_KEY_ID: nonEmptyString.optional(),
  RAZORPAY_KEY_SECRET: nonEmptyString.optional(),
  CRON_SECRET: nonEmptyString.optional(),
  RECOVERY_RECONCILIATION_TIMEOUT_MINUTES: nonEmptyString.optional(),
  AI_PROVIDER_API_KEY: nonEmptyString.optional(),
  OPENAI_API_KEY: nonEmptyString.optional(), // some ai sdk might use this
  RAZORPAY_WEBHOOK_SECRET: nonEmptyString.optional(),
  REDIS_URL: nonEmptyString.optional(),
  RATE_LIMIT_PROVIDER: nonEmptyString.optional(),
  SESSION_PASSWORD: z.string().min(32).optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).optional(),
}).superRefine((data, ctx) => {
  // Distinguish Build-Time vs Run-Time
  // During Next.js static collection, the application is technically 'booted' to collect page data.
  // We should not crash the build if runtime secrets are missing, as they are provided by the deployment environment at runtime.
  const isNextBuild = process.env.npm_lifecycle_event === 'build' || process.env.SKIP_ENV_VALIDATION === '1';

  if (data.NODE_ENV === 'production' && !isNextBuild) {
    const required = [
      'DATABASE_URL', 
      'CRON_SECRET', 
      'SESSION_PASSWORD',
      'REDIS_URL',
      'CREDENTIAL_ENCRYPTION_KEY'
    ] as const;
    
    for (const field of required) {
      if (!data[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required production environment variable: ${field}`,
          path: [field]
        });
      }
    }
  }
});

export const env = envSchema.parse(process.env);

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
};

type ConfigResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      missing: string[];
    };

export function getRazorpayConfig(): ConfigResult<RazorpayConfig> {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const missing: string[] = [];

  if (!keyId) {
    missing.push("RAZORPAY_KEY_ID");
  }

  if (!keySecret) {
    missing.push("RAZORPAY_KEY_SECRET");
  }

  if (!keyId || !keySecret) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    value: {
      keyId,
      keySecret,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    },
  };
}
