import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
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

import { getBook, syncFromCloud } from './utils/db';
import type { Book } from './utils/db';
import type { SyncStatus } from './utils/db';
import { isCloudSyncEnabled } from './lib/supabase';
import { useNetwork } from './hooks/useNetwork';
import { processSyncQueue, subscribeSyncStatus } from './utils/db';
import { perfLog } from './utils/perf';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { loadAppSettings } from './utils/settings';
import { recordSessionAndUpdateProgress } from './utils/gamification';
import { useHashViewSync } from './hooks/useHashViewSync';
import { useAuthSession } from './hooks/useAuthSession';

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

  // User Session State
  const sessionUser = useAuthSession();

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
      const settings = await loadAppSettings();

      setDefaultWpm(settings.defaultWpm);
      setDefaultChunkSize(settings.defaultChunkSize);
      setDefaultFont(settings.defaultFont);
      setBionicMode(settings.bionicMode);
      setAutoAccelerate(settings.autoAccelerate);
      document.documentElement.setAttribute('data-theme', settings.theme);

      if (sessionUser) {
        await syncFromCloud();
        const syncedSettings = await loadAppSettings();
        setDefaultWpm(syncedSettings.defaultWpm);
        setDefaultChunkSize(syncedSettings.defaultChunkSize);
        setDefaultFont(syncedSettings.defaultFont);
        setBionicMode(syncedSettings.bionicMode);
        setAutoAccelerate(syncedSettings.autoAccelerate);
        document.documentElement.setAttribute('data-theme', syncedSettings.theme);
      }
      setPhase('ready');
    };
    loadData().catch(() => {
      setPhase('error');
      toast.error('App failed to initialize. Please refresh.');
    });
  }, [sessionUser]);

  const refreshSettings = useCallback(async () => {
    const settings = await loadAppSettings();
    setDefaultWpm(settings.defaultWpm);
    setDefaultChunkSize(settings.defaultChunkSize);
    setDefaultFont(settings.defaultFont);
    setBionicMode(settings.bionicMode);
    setAutoAccelerate(settings.autoAccelerate);
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, []);

  // Gamification Logic
  const handleSessionComplete = useCallback(async (wordsRead: number, sessionWpm: number, durationSeconds: number) => {
    await recordSessionAndUpdateProgress(wordsRead, sessionWpm, durationSeconds);
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

  useHashViewSync({
    view,
    setView,
    isView: isAppView,
    readerView: 'reader',
    fallbackView: 'library',
    canEnterReader: Boolean(currentBook),
  });

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
