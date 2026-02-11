import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
const Library = lazy(() => import('./components/Library'));
const Header = lazy(() => import('./components/Header'));
const Footer = lazy(() => import('./components/Footer'));
const ReaderView = lazy(() => import('./components/ReaderView'));
const PerfDiagnostics = lazy(() => import('./components/PerfDiagnostics'));
// Lazy loaded components
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Stats = lazy(() => import('./components/Stats').then(m => ({ default: m.Stats })));
const Gym = lazy(() => import('./components/Gym').then(m => ({ default: m.Gym })));
const Achievements = lazy(() => import('./components/Achievements').then(m => ({ default: m.Achievements })));

import { getUserProgress, updateUserProgress, getSessions, getBooks, getBook, syncFromCloud } from './utils/db';
import type { Book } from './utils/db';
import type { SyncStatus } from './utils/db';
import { checkNewAchievements } from './utils/achievements';
import { isCloudSyncEnabled, supabase } from './lib/supabase';
import { useNetwork } from './hooks/useNetwork';
import { processSyncQueue, subscribeSyncStatus } from './utils/db';
import { perfLog } from './utils/perf';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';

type AppView = 'library' | 'reader' | 'settings' | 'stats' | 'gym' | 'achievements';
type AppPhase = 'boot' | 'hydrating' | 'ready' | 'offline' | 'error';
const APP_VIEWS: readonly AppView[] = ['library', 'reader', 'settings', 'stats', 'gym', 'achievements'];

const isAppView = (value: string): value is AppView => {
  return (APP_VIEWS as readonly string[]).includes(value);
};

function App() {
  // Navigation State
  const [view, setView] = useState<AppView>('library');
  const [phase, setPhase] = useState<AppPhase>('boot');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const isApplyingHashFromViewRef = useRef(false);

  // User Session State
  const [sessionUser, setSessionUser] = useState<{ id: string } | null>(null);

  // Network State
  const isOnline = useNetwork();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    phase: 'idle',
    queueSize: 0,
    retryAttempts: 0,
    nextRetryAt: null,
    lastSyncedAt: null,
    lastError: null,
  });

  useEffect(() => {
    return subscribeSyncStatus(setSyncStatus);
  }, []);

  // Sync Queue Processing
  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
      toast.success('Back online', { id: 'online-toast', duration: 2000, icon: '🌐' });
    } else {
      toast('Offline Mode', { id: 'offline-toast', icon: '📶' });
    }
  }, [isOnline]);
  const effectivePhase: AppPhase = phase === 'ready' && !isOnline ? 'offline' : phase;

  // App Preferences (Default Settings)
  const [defaultWpm, setDefaultWpm] = useState(300);
  const [defaultChunkSize, setDefaultChunkSize] = useState(1);
  const [defaultFont, setDefaultFont] = useState('mono');
  const defaultFontSize = 3;
  const [bionicMode, setBionicMode] = useState(false);
  const [autoAccelerate, setAutoAccelerate] = useState(false);

  // Auth Session
  useEffect(() => {
    if (!isCloudSyncEnabled || !supabase) {
      toast('Cloud sync disabled: local-only mode', { id: 'local-only-toast', duration: 3500 });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-Sync
  useEffect(() => {
    if (!sessionUser) return;
    const interval = setInterval(async () => {
      await syncFromCloud();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sessionUser]);

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      setPhase('hydrating');
      const loadedProgress = await getUserProgress();

      const prefWpm = loadedProgress.defaultWpm || parseInt(localStorage.getItem('defaultWpm') || '300');
      const prefChunk = loadedProgress.defaultChunkSize || parseInt(localStorage.getItem('defaultChunkSize') || '1');
      const prefFont = loadedProgress.defaultFont || localStorage.getItem('defaultFont') || 'mono';
      const prefTheme = loadedProgress.theme || localStorage.getItem('theme') || 'default';
      const prefBionic = loadedProgress.bionicMode ?? (localStorage.getItem('bionicMode') === 'true');
      const prefAuto = loadedProgress.autoAccelerate ?? (localStorage.getItem('autoAccelerate') === 'true');
      // font size not in DB yet? defaulting to 3.

      setDefaultWpm(prefWpm);
      setDefaultChunkSize(prefChunk);
      setDefaultFont(prefFont);
      setBionicMode(prefBionic);
      setAutoAccelerate(prefAuto);
      document.documentElement.setAttribute('data-theme', prefTheme);

      if (sessionUser) {
        await syncFromCloud();
        const postSync = await getUserProgress();
        if (postSync.theme && postSync.theme !== prefTheme) {
          document.documentElement.setAttribute('data-theme', postSync.theme);
        }
        // Update prefs if cloud is different
        if (postSync.defaultWpm) setDefaultWpm(postSync.defaultWpm);
      }
      setPhase('ready');
    };
    loadData().catch(() => {
      setPhase('error');
      toast.error('App failed to initialize. Please refresh.');
    });
  }, [sessionUser]);

  const refreshSettings = useCallback(() => {
    // Logic to reload settings if changed in Settings view
    const savedBionic = localStorage.getItem('bionicMode');
    setBionicMode(savedBionic === 'true');
    const savedAuto = localStorage.getItem('autoAccelerate');
    setAutoAccelerate(savedAuto === 'true');
  }, []);

  // Gamification Logic
  const handleSessionComplete = useCallback(async (wordsRead: number, sessionWpm: number, durationSeconds: number) => {
    const progress = await getUserProgress();
    const sessions = await getSessions();
    const allBooks = await getBooks();
    const today = new Date().toISOString().split('T')[0];

    const todaySessions = sessions.filter(s =>
      new Date(s.timestamp).toISOString().split('T')[0] === today
    );
    const wordsToday = todaySessions.reduce((acc, s) => acc + s.wordsRead, 0) + wordsRead;

    let newStreak = progress.currentStreak;
    let newLongestStreak = progress.longestStreak;

    if (progress.lastReadDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (progress.lastReadDate === yesterdayStr) {
        newStreak = progress.currentStreak + 1;
      } else if (progress.lastReadDate === '') {
        newStreak = 1;
      } else {
        newStreak = 1;
      }
      newLongestStreak = Math.max(newLongestStreak, newStreak);
    }

    let newGoalMetCount = progress.dailyGoalMetCount;
    const prevWordsToday = wordsToday - wordsRead;
    if (prevWordsToday < progress.dailyGoal && wordsToday >= progress.dailyGoal) {
      newGoalMetCount++;
    }

    const newPeakWpm = Math.max(progress.peakWpm, sessionWpm);
    const newTotalWords = progress.totalWordsRead + wordsRead;
    const totalTimeReadSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0) + durationSeconds;
    const booksFinishedCount = allBooks.filter(b => b.progress >= 1).length;

    const stats = {
      totalWordsRead: newTotalWords,
      peakWpm: newPeakWpm,
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      sessionCount: sessions.length + 1,
      dailyGoalMetCount: newGoalMetCount,
      totalTimeReadSeconds,
      booksFinishedCount,
      gymBestTime: progress.gymBestTime,
      lastSessionDuration: durationSeconds,
    };

    const newAchievements = checkNewAchievements(stats, progress.unlockedAchievements);

    await updateUserProgress({
      lastReadDate: today,
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      peakWpm: newPeakWpm,
      totalWordsRead: newTotalWords,
      dailyGoalMetCount: newGoalMetCount,
      unlockedAchievements: [...progress.unlockedAchievements, ...newAchievements],
    });

    if (newAchievements.length > 0) {
      newAchievements.forEach(() => {
        toast.success(`🏆 Achievement Unlocked!`, { duration: 4000 });
      });
    }
  }, []);

  const handleSelectBook = useCallback(async (bookId: string) => {
    const start = performance.now();
    const book = await getBook(bookId);
    perfLog('open_book.fetch', performance.now() - start, { found: Boolean(book) });
    if (!book) {
      toast.error('Could not open this book.');
      return;
    }
    setCurrentBook(book);
    setView('reader');
    requestAnimationFrame(() => {
      perfLog('open_book.total_to_view', performance.now() - start, { bookId });
    });
  }, []);

  const handleNavigate = useCallback((newView: string) => {
    if (!isAppView(newView)) return;
    setView(newView);
    if (newView !== 'reader') setCurrentBook(null);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    handleNavigate('library');
  }, [handleNavigate]);

  const handleReaderBack = useCallback(() => {
    setView('library');
    setCurrentBook(null);
  }, []);

  // Hash Navigation Support
  useEffect(() => {
    const handleHashChange = () => {
      if (isApplyingHashFromViewRef.current) {
        isApplyingHashFromViewRef.current = false;
        return;
      }
      const hash = window.location.hash.slice(1);
      if (hash === 'reader') {
        if (!currentBook) {
          window.location.hash = 'library';
          setView('library');
        } else {
          setView('reader');
        }
      } else if (isAppView(hash)) {
        setView(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentBook]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash !== view) {
      // Only update hash if different to avoid loop/scroll issues
      isApplyingHashFromViewRef.current = true;
      window.location.hash = view;
    }
  }, [view]);

  return (
    <div className="container app-container">
      {effectivePhase !== 'ready' && effectivePhase !== 'offline' ? (
        <div className="view-loader" role="status" aria-live="polite">
          {effectivePhase === 'error' ? 'Initialization failed.' : 'Loading FlashRead...'}
        </div>
      ) : (
        <>
      <ViewErrorBoundary resetKey={`primary-${view}`}>
      <Suspense fallback={<div className="view-loader" role="status" aria-live="polite">Loading view...</div>}>
        {/* Header only on main pages */}
        {view === 'library' && (
          <Header
            onNavigate={handleNavigate}
            currentView={view}
            isOnline={isOnline}
            isCloudSyncEnabled={isCloudSyncEnabled}
            syncStatus={syncStatus}
          />
        )}

        {view === 'library' && (
          <Library onSelectBook={handleSelectBook} />
        )}

        {view === 'reader' && currentBook && (
          <ReaderView
            key={currentBook.id}
            book={currentBook}
            initialWpm={currentBook.wpm || defaultWpm}
            initialChunkSize={defaultChunkSize}
            initialFont={defaultFont}
            initialFontSize={defaultFontSize}
            initialBionicMode={bionicMode}
            initialAutoAccelerate={autoAccelerate}
            onBack={handleReaderBack}
            onUpdateStats={handleSessionComplete}
          />
        )}
      </Suspense>
      </ViewErrorBoundary>

      <ViewErrorBoundary resetKey={`secondary-${view}`}>
      <Suspense fallback={<div className="view-loader compact" role="status" aria-live="polite">Loading...</div>}>
        {view === 'settings' && (
          <Settings
            onBack={handleBackToLibrary}
            updateTheme={refreshSettings}
          />
        )}
        {view === 'stats' && <Stats onBack={handleBackToLibrary} />}
        {view === 'gym' && <Gym onBack={handleBackToLibrary} />}
        {view === 'achievements' && <Achievements onBack={handleBackToLibrary} />}
      </Suspense>
      </ViewErrorBoundary>

      <Toaster position="bottom-center" toastOptions={{ className: 'app-toast' }} />

      <Suspense fallback={null}>
        {/* Footer is global except reader (ReaderView handles its own layout/footer-less state) */}
        {view !== 'reader' && <Footer />}
      </Suspense>
      <Suspense fallback={null}>
        <PerfDiagnostics />
      </Suspense>
        </>
      )}
    </div>
  );
}

export default App;
