import { getUserProgress, updateUserProgress } from './db';

export interface AppSettings {
  defaultWpm: number;
  defaultChunkSize: number;
  defaultFont: string;
  theme: string;
  bionicMode: boolean;
  autoAccelerate: boolean;
  dailyGoal: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultWpm: 300,
  defaultChunkSize: 1,
  defaultFont: 'mono',
  theme: 'default',
  bionicMode: false,
  autoAccelerate: false,
  dailyGoal: 5000,
};

const toInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readLocalSettings = (): AppSettings => ({
  defaultWpm: toInt(localStorage.getItem('defaultWpm'), DEFAULT_SETTINGS.defaultWpm),
  defaultChunkSize: toInt(localStorage.getItem('defaultChunkSize'), DEFAULT_SETTINGS.defaultChunkSize),
  defaultFont: localStorage.getItem('defaultFont') || DEFAULT_SETTINGS.defaultFont,
  theme: localStorage.getItem('theme') || DEFAULT_SETTINGS.theme,
  bionicMode: localStorage.getItem('bionicMode') === 'true',
  autoAccelerate: localStorage.getItem('autoAccelerate') === 'true',
  dailyGoal: DEFAULT_SETTINGS.dailyGoal,
});

export const loadAppSettings = async (): Promise<AppSettings> => {
  const local = readLocalSettings();
  try {
    const progress = await getUserProgress();
    return {
      defaultWpm: progress.defaultWpm || local.defaultWpm,
      defaultChunkSize: progress.defaultChunkSize || local.defaultChunkSize,
      defaultFont: progress.defaultFont || local.defaultFont,
      theme: progress.theme || local.theme,
      bionicMode: progress.bionicMode ?? local.bionicMode,
      autoAccelerate: progress.autoAccelerate ?? local.autoAccelerate,
      dailyGoal: progress.dailyGoal || local.dailyGoal,
    };
  } catch {
    return local;
  }
};

export const saveAppSettings = async (settings: AppSettings) => {
  localStorage.setItem('defaultWpm', settings.defaultWpm.toString());
  localStorage.setItem('defaultChunkSize', settings.defaultChunkSize.toString());
  localStorage.setItem('defaultFont', settings.defaultFont);
  localStorage.setItem('theme', settings.theme);
  localStorage.setItem('bionicMode', settings.bionicMode.toString());
  localStorage.setItem('autoAccelerate', settings.autoAccelerate.toString());

  await updateUserProgress({
    dailyGoal: settings.dailyGoal,
    defaultWpm: settings.defaultWpm,
    defaultChunkSize: settings.defaultChunkSize,
    defaultFont: settings.defaultFont,
    theme: settings.theme,
    bionicMode: settings.bionicMode,
    autoAccelerate: settings.autoAccelerate,
  });
};
