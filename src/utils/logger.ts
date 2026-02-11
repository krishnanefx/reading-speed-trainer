const isDev = import.meta.env.DEV;

export const devWarn = (...args: unknown[]) => {
  if (isDev) console.warn(...args);
};

export const devError = (...args: unknown[]) => {
  if (isDev) console.error(...args);
};
