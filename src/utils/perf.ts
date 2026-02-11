type PerfMeta = Record<string, string | number | boolean | null | undefined>;
export interface PerfEvent {
  phase: string;
  durationMs: number;
  meta?: PerfMeta;
  ts: number;
}

const hasWindow = typeof window !== 'undefined';
const MAX_EVENTS = 120;
const perfEvents: PerfEvent[] = [];
const perfListeners = new Set<(events: PerfEvent[]) => void>();

export const isPerfEnabled = (): boolean => {
  if (!hasWindow) return false;
  const queryEnabled = new URLSearchParams(window.location.search).get('perf') === '1';
  const storageEnabled = window.localStorage.getItem('flashread_perf') === '1';
  return queryEnabled || storageEnabled;
};

export const perfLog = (phase: string, durationMs: number, meta?: PerfMeta) => {
  if (!isPerfEnabled()) return;
  const event: PerfEvent = {
    phase,
    durationMs,
    meta,
    ts: Date.now(),
  };
  perfEvents.push(event);
  if (perfEvents.length > MAX_EVENTS) perfEvents.shift();
  for (const listener of perfListeners) listener([...perfEvents]);

  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.info(`[perf] ${phase}: ${durationMs.toFixed(1)}ms${suffix}`);
};

export const getPerfEvents = (): PerfEvent[] => [...perfEvents];

export const subscribePerfEvents = (listener: (events: PerfEvent[]) => void) => {
  perfListeners.add(listener);
  listener([...perfEvents]);
  return () => {
    perfListeners.delete(listener);
  };
};
