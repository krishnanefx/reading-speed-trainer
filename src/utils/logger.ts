const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const telemetryEndpoint = (import.meta.env.VITE_LOG_SINK_URL || '').trim();

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];

const isSensitiveKey = (key: string) => {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((segment) => lower.includes(segment));
};

const sanitizeMeta = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeMeta);

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitizeMeta(entry);
  }
  return output;
};

export interface LogEvent {
  level: LogLevel;
  event: string;
  message?: string;
  meta?: unknown;
  ts: string;
}

const canShipTelemetry = (): boolean => {
  return isProd && telemetryEndpoint.length > 0;
};

const shipTelemetry = (payload: LogEvent) => {
  if (!canShipTelemetry()) return;
  if (payload.level === 'debug' || payload.level === 'info') return;

  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(telemetryEndpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(telemetryEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Never break app flow on telemetry shipping failures.
  }
};

export const emitLog = (level: LogLevel, event: string, message?: string, meta?: unknown) => {
  if (isProd && level === 'debug') return;

  const payload: LogEvent = {
    level,
    event,
    message,
    meta: sanitizeMeta(meta),
    ts: new Date().toISOString(),
  };
  shipTelemetry(payload);

  if (level === 'error') {
    console.error(payload);
    return;
  }
  if (level === 'warn') {
    console.warn(payload);
    return;
  }
  if (isDev) {
    console.info(payload);
  }
};

export const devWarn = (...args: unknown[]) => {
  if (isDev) emitLog('warn', 'dev.warn', undefined, args);
};

export const devError = (...args: unknown[]) => {
  if (isDev) emitLog('error', 'dev.error', undefined, args);
};

export const logInfo = (event: string, message?: string, meta?: unknown) => emitLog('info', event, message, meta);
export const logWarn = (event: string, message?: string, meta?: unknown) => emitLog('warn', event, message, meta);
export const logError = (event: string, message?: string, meta?: unknown) => emitLog('error', event, message, meta);
