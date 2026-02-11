import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { syncFromCloud } from '../utils/db/index';
import { loadAppSettings } from '../utils/settings';

export type AppPhase = 'boot' | 'hydrating' | 'ready' | 'offline' | 'error';

interface SessionUser {
  id: string;
}

interface AppBootstrapState {
  phase: AppPhase;
  defaultWpm: number;
  defaultChunkSize: number;
  defaultFont: string;
  bionicMode: boolean;
  autoAccelerate: boolean;
  refreshSettings: () => Promise<void>;
}

const applyTheme = (theme: string) => {
  document.documentElement.setAttribute('data-theme', theme);
};

export const useAppBootstrap = (sessionUser: SessionUser | null): AppBootstrapState => {
  const [phase, setPhase] = useState<AppPhase>('boot');
  const [defaultWpm, setDefaultWpm] = useState(300);
  const [defaultChunkSize, setDefaultChunkSize] = useState(1);
  const [defaultFont, setDefaultFont] = useState('mono');
  const [bionicMode, setBionicMode] = useState(false);
  const [autoAccelerate, setAutoAccelerate] = useState(false);

  const applyLoadedSettings = useCallback((settings: Awaited<ReturnType<typeof loadAppSettings>>) => {
    setDefaultWpm(settings.defaultWpm);
    setDefaultChunkSize(settings.defaultChunkSize);
    setDefaultFont(settings.defaultFont);
    setBionicMode(settings.bionicMode);
    setAutoAccelerate(settings.autoAccelerate);
    applyTheme(settings.theme);
  }, []);

  const refreshSettings = useCallback(async () => {
    const settings = await loadAppSettings();
    applyLoadedSettings(settings);
  }, [applyLoadedSettings]);

  useEffect(() => {
    if (!sessionUser) return;
    const interval = setInterval(async () => {
      await syncFromCloud();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sessionUser]);

  useEffect(() => {
    const loadData = async () => {
      setPhase('hydrating');
      await refreshSettings();

      if (sessionUser) {
        await syncFromCloud();
        await refreshSettings();
      }

      setPhase('ready');
    };

    loadData().catch(() => {
      setPhase('error');
      toast.error('App failed to initialize. Please refresh.');
    });
  }, [refreshSettings, sessionUser]);

  return {
    phase,
    defaultWpm,
    defaultChunkSize,
    defaultFont,
    bionicMode,
    autoAccelerate,
    refreshSettings,
  };
};
