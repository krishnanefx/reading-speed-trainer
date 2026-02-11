type PerfMeta = Record<string, string | number | boolean | null | undefined>;

const hasWindow = typeof window !== 'undefined';

export const isPerfEnabled = (): boolean => {
  if (!hasWindow) return false;
  const queryEnabled = new URLSearchParams(window.location.search).get('perf') === '1';
  const storageEnabled = window.localStorage.getItem('flashread_perf') === '1';
  return queryEnabled || storageEnabled;
};

export const perfLog = (phase: string, durationMs: number, meta?: PerfMeta) => {
  if (!isPerfEnabled()) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.info(`[perf] ${phase}: ${durationMs.toFixed(1)}ms${suffix}`);
};
