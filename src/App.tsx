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

import type { SyncStatus } from './utils/db/index';
import { isCloudSyncEnabled } from './lib/supabase';
import { useNetwork } from './hooks/useNetwork';
import { processSyncQueue, subscribeSyncStatus } from './utils/db/index';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { recordSessionAndUpdateProgress } from './utils/gamification';
import { useHashViewSync } from './hooks/useHashViewSync';
import { useAuthSession } from './hooks/useAuthSession';
import { useAppBootstrap, type AppPhase } from './hooks/useAppBootstrap';
import { isAppView, useAppViewRouting } from './hooks/useAppViewRouting';


function App() {
  // Navigation State
  const {
    view,
    currentBook,
    setView,
    handleSelectBook,
    handleNavigate,
    handleBackToLibrary,
    handleReaderBack,
  } = useAppViewRouting();

  // User Session State
  const sessionUser = useAuthSession();
  const {
    phase,
    defaultWpm,
    defaultChunkSize,
    defaultFont,
    bionicMode,
    autoAccelerate,
    refreshSettings,
  } = useAppBootstrap(sessionUser);

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
  const defaultFontSize = 3;

  // Gamification Logic
  const handleSessionComplete = useCallback(async (wordsRead: number, sessionWpm: number, durationSeconds: number) => {
    await recordSessionAndUpdateProgress(wordsRead, sessionWpm, durationSeconds);
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
