import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Toaster, toast } from 'react-hot-toast';
const Library = lazy(() => import('./components/Library'));
const Header = lazy(() => import('./components/Header'));
const Footer = lazy(() => import('./components/Footer'));
const ReaderView = lazy(() => import('./components/ReaderView'));
// Lazy loaded components
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Stats = lazy(() => import('./components/Stats').then(m => ({ default: m.Stats })));
const Gym = lazy(() => import('./components/Gym').then(m => ({ default: m.Gym })));
const Achievements = lazy(() => import('./components/Achievements').then(m => ({ default: m.Achievements })));

import { getUserProgress, updateUserProgress, getSessions, getBooks, syncFromCloud } from './utils/db';
import type { Book } from './utils/db';
import { checkNewAchievements } from './utils/achievements';
import { isCloudSyncEnabled, supabase } from './lib/supabase';
import { useNetwork } from './hooks/useNetwork';
import { processSyncQueue } from './utils/db';

function App() {
  // Navigation State
  const [view, setView] = useState<'library' | 'reader' | 'settings' | 'stats' | 'gym' | 'achievements'>('library');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  // User Session State
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [gamificationProgress, setGamificationProgress] = useState<any>(null);

  // Network State
  const isOnline = useNetwork();

  // Sync Queue Processing
  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
      toast.success('Back online', { id: 'online-toast', duration: 2000, icon: '🌐' });
    } else {
      toast('Offline Mode', { id: 'offline-toast', icon: '📶' });
    }
  }, [isOnline]);

  // App Preferences (Default Settings)
  const [defaultWpm, setDefaultWpm] = useState(300);
  const [defaultChunkSize, setDefaultChunkSize] = useState(1);
  const [defaultFont, setDefaultFont] = useState('mono');
  const [defaultFontSize, setDefaultFontSize] = useState(3);
  const [bionicMode, setBionicMode] = useState(false);
  const [autoAccelerate, setAutoAccelerate] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); // Only used for container class on App div if needed, but ReaderView handles its own focus mode. 
  // Actually, ReaderView fully handles focus mode UI. App container might not need 'focus-mode' class if ReaderView takes over.
  // But let's keep it clean.

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
      console.log('Running Auto-Sync...');
      try {
        await syncFromCloud();
      } catch (e) {
        console.error("Auto Sync Failed", e);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sessionUser]);

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
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
      setGamificationProgress(loadedProgress);

      document.documentElement.setAttribute('data-theme', prefTheme);

      if (sessionUser) {
        await syncFromCloud();
        const postSync = await getUserProgress();
        if (postSync.theme && postSync.theme !== prefTheme) {
          document.documentElement.setAttribute('data-theme', postSync.theme);
        }
        setGamificationProgress(postSync);
        // Update prefs if cloud is different
        if (postSync.defaultWpm) setDefaultWpm(postSync.defaultWpm);
      }
    };
    loadData();
  }, [sessionUser]);

  const refreshSettings = () => {
    // Logic to reload settings if changed in Settings view
    const savedBionic = localStorage.getItem('bionicMode');
    setBionicMode(savedBionic === 'true');
    const savedAuto = localStorage.getItem('autoAccelerate');
    setAutoAccelerate(savedAuto === 'true');
  };

  // Gamification Logic
  const handleSessionComplete = async (wordsRead: number, sessionWpm: number, durationSeconds: number) => {
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
  };

  const handleUpdateSettings = (settings: { wpm?: number }) => {
    // Optional: Update default WPM if user changes it significantly?
    // For now, we trust ReaderView handles Book WPM. 
    // If we want to persist last used WPM as default:
    if (settings.wpm) {
      // setDefaultWpm(settings.wpm); // Uncomment if we want "sticky" global WPM
    }
  };

  const handleSelectBook = (book: Book) => {
    setCurrentBook(book);
    // Determine initial WPM: Book WPM > Default WPM
    // Book WPM might be undefined if new.
    setView('reader');
  };

  const handleNavigate = useCallback((newView: string) => {
    // @ts-ignore
    setView(newView);
    if (newView !== 'reader') setCurrentBook(null);
  }, []);

  // Hash Navigation Support
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'reader') {
        if (!currentBook) {
          window.location.hash = 'library';
          setView('library');
        } else {
          setView('reader');
        }
      } else if (['settings', 'stats', 'gym', 'achievements', 'library'].includes(hash)) {
        // @ts-ignore
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
      window.location.hash = view;
    }
  }, [view]);

  return (
    <div className="container" style={{ transition: 'all 0.5s ease' }}>
      <Suspense fallback={<div className="view-loader" role="status" aria-live="polite">Loading view...</div>}>
        {/* Header only on main pages */}
        {view === 'library' && (
          <Header
            onNavigate={handleNavigate}
            currentView={view}
            isOnline={isOnline}
            isCloudSyncEnabled={isCloudSyncEnabled}
          />
        )}

        {view === 'library' && (
          <Library onSelectBook={handleSelectBook} />
        )}

        {view === 'reader' && currentBook && (
          <ReaderView
            book={currentBook}
            initialWpm={currentBook.wpm || defaultWpm}
            initialChunkSize={defaultChunkSize}
            initialFont={defaultFont}
            initialFontSize={defaultFontSize}
            initialBionicMode={bionicMode}
            initialAutoAccelerate={autoAccelerate}
            onBack={() => {
              setView('library');
              setCurrentBook(null);
            }}
            onUpdateStats={handleSessionComplete}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </Suspense>

      <Suspense fallback={<div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading...</div>}>
        {view === 'settings' && (
          <Settings
            onBack={() => handleNavigate('library')}
            updateTheme={refreshSettings}
          />
        )}
        {view === 'stats' && <Stats onBack={() => handleNavigate('library')} />}
        {view === 'gym' && <Gym onBack={() => handleNavigate('library')} />}
        {view === 'achievements' && <Achievements onBack={() => handleNavigate('library')} />}
      </Suspense>

      <Toaster position="bottom-center" toastOptions={{
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          border: '1px solid rgba(255,255,255,0.1)'
        }
      }} />

      <Suspense fallback={null}>
        {/* Footer is global except reader (ReaderView handles its own layout/footer-less state) */}
        {view !== 'reader' && <Footer />}
      </Suspense>
    </div>
  );
}

export default App;
