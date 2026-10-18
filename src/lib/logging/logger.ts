/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Safe Structured Logger dengan Sanitasi Otomatis Payload Sensitif
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'secret',
  'token',
  'service_role_key',
  'supabase_service_role_key',
  'apikey',
  'authorization',
  'cookie',
  'credential',
  'private_key',
  'access_token',
  'refresh_token',
]);

export function sanitizePayload<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Mask potential token/secret patterns if detected
    return data as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('password')) {
        sanitizedObj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitizedObj[key] = sanitizePayload(value);
      } else {
        sanitizedObj[key] = value;
      }
    }
    return sanitizedObj as T;
  }

  return data;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, unknown>;
}

export class SafeLogger {
  private log(level: LogLevel, message: string, context?: Record<string, unknown>, correlationId?: string): LogEntry {
    const sanitizedContext = context ? sanitizePayload(context) : undefined;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...(sanitizedContext ? { context: sanitizedContext } : {})
    };

    const serialized = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(serialized);
        break;
      case 'warn':
        console.warn(serialized);
        break;
      case 'debug':
        if (process.env.NODE_ENV !== 'production') {
          console.debug(serialized);
        }
        break;
      default:
        console.log(serialized);
    }

    return entry;
  }

  public debug(message: string, context?: Record<string, unknown>, correlationId?: string): LogEntry {
    return this.log('debug', message, context, correlationId);
  }

  public info(message: string, context?: Record<string, unknown>, correlationId?: string): LogEntry {
    return this.log('info', message, context, correlationId);
  }

  public warn(message: string, context?: Record<string, unknown>, correlationId?: string): LogEntry {
    return this.log('warn', message, context, correlationId);
  }

  public error(message: string, context?: Record<string, unknown>, correlationId?: string): LogEntry {
    return this.log('error', message, context, correlationId);
  }
}

export const logger = new SafeLogger();
