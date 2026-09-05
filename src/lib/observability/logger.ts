/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId?: string;
  merchantId?: string;
  opportunityId?: string;
  actionId?: string;
}

export const loggerContext = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: Partial<LogContext>, fn: () => T): T {
  const parent = loggerContext.getStore() || {};
  return loggerContext.run({ ...parent, ...context }, fn);
}

// Redact rules
const REDACT_KEYS = [
  'authorization', 'secret', 'password', 'key', 'token', 
  'credentials', 'razorpay_signature', 'x-razorpay-signature', 
  'webhook_secret'
];

function redact(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  
  const result: any = {};
  for (const k of Object.keys(obj)) {
    const kLower = k.toLowerCase();
    if (REDACT_KEYS.some(rk => kLower.includes(rk))) {
      result[k] = '[REDACTED]';
    } else if (obj[k] instanceof Error) {
      result[k] = {
        name: obj[k].name,
        message: obj[k].message,
        stack: obj[k].stack
      };
    } else {
      result[k] = typeof obj[k] === 'object' ? redact(obj[k]) : obj[k];
    }
  }
  return result;
}

export const logger = {
  info: (event: string, meta: Record<string, any> = {}) => log('INFO', event, meta),
  warn: (event: string, meta: Record<string, any> = {}) => log('WARN', event, meta),
  error: (event: string, meta: Record<string, any> = {}) => log('ERROR', event, meta),
  debug: (event: string, meta: Record<string, any> = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      log('DEBUG', event, meta);
    }
  },
};

function log(level: string, event: string, meta: Record<string, any>) {
  const ctx = loggerContext.getStore() || {};
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: ctx.requestId,
    merchantId: ctx.merchantId,
    opportunityId: ctx.opportunityId,
    actionId: ctx.actionId,
    ...redact(meta)
  };

  // Remove undefined fields to keep logs clean
  Object.keys(logEntry).forEach(key => {
    if ((logEntry as any)[key] === undefined) {
      delete (logEntry as any)[key];
    }
  });

  const message = JSON.stringify(logEntry);
  
  if (level === 'ERROR') {
    console.error(message);
  } else if (level === 'WARN') {
    console.warn(message);
  } else {
    console.log(message);
  }
}
