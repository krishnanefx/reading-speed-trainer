import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { debounce } from './utils/common';
import { Toaster, toast } from 'react-hot-toast';
import Reader from './components/Reader';
import Controls from './components/Controls';
import Library from './components/Library';
// Lazy loaded components for better startup performance
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Stats = lazy(() => import('./components/Stats').then(m => ({ default: m.Stats })));
const Gym = lazy(() => import('./components/Gym').then(m => ({ default: m.Gym })));
const Achievements = lazy(() => import('./components/Achievements').then(m => ({ default: m.Achievements })));

import { useReader } from './hooks/useReader';
import { updateBookProgress, logSession, getUserProgress, updateUserProgress, getSessions, getBooks, syncFromCloud } from './utils/db'; // Corrected import
import type { Book } from './utils/db';
import { checkNewAchievements } from './utils/achievements';
import { supabase } from './lib/supabase'; // Direct import

function App() {
  const [view, setView] = useState<'library' | 'reader' | 'settings' | 'stats' | 'gym' | 'achievements'>('library');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // const [books, setBooks] = useState<Book[]>([]); // Library manages its own books for now, or we ignore this
  const [gamificationProgress, setGamificationProgress] = useState<any>(null); // Renamed from progress

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Reader State
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(300);
  const [chunkSize, setChunkSize] = useState(1);
  const [font, setFont] = useState('mono');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [bionicMode, setBionicMode] = useState(false);
  const [autoAccelerate, setAutoAccelerate] = useState(false);

  // Session Tracking Refs
  const sessionStartTimeRef = useRef<number | null>(null);
  const wordsReadStartRef = useRef<number>(0);

  // Auto-Sync Every 5 Minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      if (sessionUser) {
        console.log('Running Auto-Sync...');
        setIsSyncing(true);
        try {
          // Sync from cloud first
          await syncFromCloud();

          // Then Push local changes (Books) - dirty check is complex, so iterate all?
          // Or just rely on updateBookProgress doing its job immediately.
          // But let's verify connectivity.
        } catch (e) {
          console.error("Auto Sync Failed", e);
        } finally {
          setIsSyncing(false);
        }
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sessionUser]);

  // Initial Data Load (Books & Settings)
  useEffect(() => {
    const loadData = async () => {
      // Load Settings from Sync/DB
      const loadedProgress = await getUserProgress();

      // Defaults Logic: Use Cloud Preference -> then LocalStorage -> then Hardcoded
      const prefWpm = loadedProgress.defaultWpm || parseInt(localStorage.getItem('defaultWpm') || '300');
      const prefChunk = loadedProgress.defaultChunkSize || parseInt(localStorage.getItem('defaultChunkSize') || '1');
      const prefFont = loadedProgress.defaultFont || localStorage.getItem('defaultFont') || 'mono';
      const prefTheme = loadedProgress.theme || localStorage.getItem('theme') || 'default';
      const prefBionic = loadedProgress.bionicMode ?? (localStorage.getItem('bionicMode') === 'true');
      const prefAuto = loadedProgress.autoAccelerate ?? (localStorage.getItem('autoAccelerate') === 'true');

      // Set State
      setWpm(prefWpm);
      setChunkSize(prefChunk);
      setFont(prefFont);
      setBionicMode(prefBionic);
      setAutoAccelerate(prefAuto);

      // Apply Theme
      document.documentElement.setAttribute('data-theme', prefTheme);

      // Load Gamification
      setGamificationProgress(loadedProgress as any); // Typings might mismatch slightly, cast safe here

      // Sync from Cloud (might overwrite above if newer)
      if (sessionUser) {
        await syncFromCloud();
        // Reload after sync?
        const postSyncProgress = await getUserProgress();
        if (postSyncProgress.theme && postSyncProgress.theme !== prefTheme) {
          document.documentElement.setAttribute('data-theme', postSyncProgress.theme);
        }
        // Update other states if they changed after sync
        setWpm(postSyncProgress.defaultWpm || prefWpm);
        setChunkSize(postSyncProgress.defaultChunkSize || prefChunk);
        setFont(postSyncProgress.defaultFont || prefFont);
        setBionicMode(postSyncProgress.bionicMode ?? prefBionic);
        setAutoAccelerate(postSyncProgress.autoAccelerate ?? prefAuto);
        setGamificationProgress(postSyncProgress as any);
      }
    };
    loadData();
  }, [sessionUser]);

  // ... (handleSelectBook below needs to use current defaults, but defaults are in Settings component state mostly)
  // We need to hoist defaults to App level or read from DB. 
  // Reading from DB in handleSelectBook is async but fast.

  const refreshSettings = () => {
    // Re-read settings that might have changed from Settings screen
    const savedBionic = localStorage.getItem('bionicMode');
    setBionicMode(savedBionic === 'true');

    const savedAuto = localStorage.getItem('autoAccelerate');
    setAutoAccelerate(savedAuto === 'true');
  };

  const {
    words,
    currentIndex,
    isPlaying,
    currentDisplay,
    togglePlay,
    reset,
    seek,
    setIsPlaying
  } = useReader({ text, wpm, chunkSize });

  // Keep track of current index in a ref to access it in effects without re-triggering
  const latestIndexRef = useRef(currentIndex);
  useEffect(() => {
    latestIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Function to update gamification progress after a session
  const updateGamificationProgress = async (wordsRead: number, sessionWpm: number, durationSeconds: number) => {
    const progress = await getUserProgress();
    const sessions = await getSessions();
    const allBooks = await getBooks();
    const today = new Date().toISOString().split('T')[0];

    // Calculate words read today
    const todaySessions = sessions.filter(s =>
      new Date(s.timestamp).toISOString().split('T')[0] === today
    );
    const wordsToday = todaySessions.reduce((acc, s) => acc + s.wordsRead, 0) + wordsRead;

    // Streak logic
    let newStreak = progress.currentStreak;
    let newLongestStreak = progress.longestStreak;

    if (progress.lastReadDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (progress.lastReadDate === yesterdayStr) {
        newStreak = progress.currentStreak + 1;
      } else if (progress.lastReadDate === '') {
        newStreak = 1; // First ever session
      } else {
        newStreak = 1; // Reset streak
      }
      newLongestStreak = Math.max(newLongestStreak, newStreak);
    }

    // Check if daily goal was met
    let newGoalMetCount = progress.dailyGoalMetCount;
    const prevWordsToday = wordsToday - wordsRead;
    if (prevWordsToday < progress.dailyGoal && wordsToday >= progress.dailyGoal) {
      newGoalMetCount++;
    }

    // Update peak WPM
    const newPeakWpm = Math.max(progress.peakWpm, sessionWpm);

    // Total words
    const newTotalWords = progress.totalWordsRead + wordsRead;

    // Calculate new stats
    const totalTimeReadSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0) + durationSeconds;
    const booksFinishedCount = allBooks.filter(b => b.progress >= 1).length;

    // Check for new achievements
    const stats = {
      totalWordsRead: newTotalWords,
      peakWpm: newPeakWpm,
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      sessionCount: sessions.length + 1,
      dailyGoalMetCount: newGoalMetCount,
      // New Stats
      totalTimeReadSeconds,
      booksFinishedCount,
      gymBestTime: progress.gymBestTime,
      lastSessionDuration: durationSeconds,
    };

    const newAchievements = checkNewAchievements(stats, progress.unlockedAchievements);

    // Update progress
    await updateUserProgress({
      lastReadDate: today,
      currentStreak: newStreak,
      longestStreak: newLongestStreak,
      peakWpm: newPeakWpm,
      totalWordsRead: newTotalWords,
      dailyGoalMetCount: newGoalMetCount,
      unlockedAchievements: [...progress.unlockedAchievements, ...newAchievements],
    });

    // Show toast notification for new achievements
    if (newAchievements.length > 0) {
      newAchievements.forEach(() => {
        toast.success(`🏆 Achievement Unlocked!`, { duration: 4000 });
      });
    }
  };

  // Auto-Accelerate Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && autoAccelerate) {
      interval = setInterval(() => {
        setWpm(prev => Math.min(prev + 10, 2000));
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, autoAccelerate]);

  // Session Tracking Logic - Only runs on Play/Pause toggle
  useEffect(() => {
    if (isPlaying) {
      // Session Started
      sessionStartTimeRef.current = Date.now();
      wordsReadStartRef.current = latestIndexRef.current;
    } else {
      // Session Paused/Stopped/Seeked
      if (sessionStartTimeRef.current && currentBook) {
        const duration = (Date.now() - sessionStartTimeRef.current) / 1000;
        const wordsRead = Math.max(0, latestIndexRef.current - wordsReadStartRef.current);

        // Only log meaningful sessions (> 2 seconds)
        if (duration > 2 && wordsRead > 0) {
          logSession({
            id: Date.now().toString(),
            bookId: currentBook.id,
            timestamp: Date.now(),
            durationSeconds: duration,
            wordsRead: wordsRead,
            averageWpm: wpm
          });
          // Update gamification progress
          updateGamificationProgress(wordsRead, wpm, duration);
        }
        sessionStartTimeRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Handle unmounting or view change while playing
  useEffect(() => {
    return () => {
      // If component unmounts or view changes while playing, log the session
      if (isPlaying && sessionStartTimeRef.current && currentBook) {
        const duration = (Date.now() - sessionStartTimeRef.current) / 1000;
        const wordsRead = Math.max(0, latestIndexRef.current - wordsReadStartRef.current);
        if (duration > 2) {
          logSession({
            id: Date.now().toString(),
            bookId: currentBook.id,
            timestamp: Date.now(),
            durationSeconds: duration,
            wordsRead: wordsRead,
            averageWpm: wpm
          });
          // Update gamification progress
          updateGamificationProgress(wordsRead, wpm, duration);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const progress = words.length > 0 ? currentIndex / words.length : 0;

  // Debounced save for progress to prevent spamming DB/Queue
  const saveProgressDebounced = useMemo(
    () => debounce((id: string, prog: number, idx: number, speed: number) => {
      updateBookProgress(id, prog, idx, speed);
    }, 1000),
    []
  );

  // Sync progress to DB
  useEffect(() => {
    if (currentBook && words.length > 0) {
      // Save progress and current WPM (Debounced)
      saveProgressDebounced(currentBook.id, progress, latestIndexRef.current, wpm);
    }
  }, [currentIndex, currentBook, words.length, progress, wpm, saveProgressDebounced]);

  const handleSelectBook = (book: Book) => {
    setCurrentBook(book);
    setText(book.content || book.text || '');

    // Load book-specific settings if they exist
    if (book.wpm) setWpm(book.wpm);

    // Switch to reader view
    setView('reader');

    // Force reset/seek after text load
    setTimeout(() => {
      if ((book.currentIndex || 0) > 0) {
        seek(book.currentIndex || 0);
      }
    }, 100);
  };

  const handleBackToLibrary = () => {
    setCurrentBook(null);
    setView('library');
  };

  // Browser History / Hash Integration
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // remove #

      if (hash === 'reader') {
        // If trying to access reader without a book, go back to library
        if (!currentBook) {
          window.location.hash = 'library';
          setView('library');
        } else {
          setView('reader');
        }
      } else if (['settings', 'stats', 'gym', 'achievements'].includes(hash)) {
        // @ts-ignore
        setView(hash);
      } else {
        // Default to library
        if (view !== 'library') setView('library');
      }
    };

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Check initial hash on mount
    // handleHashChange(); // Don't run immediately to allow hydration if needed, or safer:
    // Actually, we want to allow deep linking to settings/stats/gym
    // But for reader, we need a book. 

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentBook]); // Dep on currentBook so we know if we can go to reader

  // Sync view TO hash
  useEffect(() => {
    const currentHash = window.location.hash.slice(1);
    if (currentHash !== view) {
      window.location.hash = view;
    }
  }, [view]);

  const handleSeek = (val: number) => {
    // Pause before seeking to ensure stats are logged correctly for the segment read so far
    setIsPlaying(false);
    const idx = Math.floor(val * words.length);
    seek(idx);
  };

  // Keyboard controls
  useEffect(() => {
    if (view !== 'reader') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setWpm(prev => Math.min(prev + 10, 1000));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setWpm(prev => Math.max(prev - 10, 60));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(currentIndex + 10 * chunkSize, words.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(currentIndex - 10 * chunkSize, 0));
          break;
        case 'KeyF':
          e.preventDefault();
          setIsFocusMode(prev => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          if (isFocusMode) setIsFocusMode(false);
          else handleBackToLibrary();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, togglePlay, setWpm, seek, currentIndex, words.length, chunkSize, isFocusMode]);

  const wordsLeft = Math.max(0, words.length - currentIndex);
  const minutesLeft = Math.ceil(wordsLeft / wpm);
  let timeLeftString = '';
  if (wordsLeft === 0) {
    timeLeftString = 'Finished';
  } else if (minutesLeft < 60) {
    timeLeftString = `${minutesLeft} min left`;
  } else {
    const h = Math.floor(minutesLeft / 60);
    const m = minutesLeft % 60;
    timeLeftString = `${h}h ${m}m left`;
  }

  return (
    <div className={`container ${isFocusMode ? 'focus-mode' : ''}`} style={{ transition: 'all 0.5s ease' }}>

      {view === 'library' && (
        <>
          <header className="app-header">
            <div className="header-content">
              <h1 className="app-title">
                Speed Reader
              </h1>
              <p className="app-subtitle">Master the art of rapid reading.</p>
            </div>

            <nav className="header-nav">
              <button onClick={() => setView('gym')} className="nav-btn" title="Eye Gym">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
              <button onClick={() => setView('achievements')} className="nav-btn" title="Achievements">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </button>
              <button onClick={() => setView('stats')} className="nav-btn" title="Statistics">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button onClick={() => setView('settings')} className="nav-btn" title="Settings">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </nav>

            <style>{`
              .app-header {
                margin-bottom: 2rem;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1.5rem;
                position: relative;
              }
              
              .header-content {
                text-align: center;
              }
              
              .app-title {
                font-size: 2.5rem;
                font-weight: 800;
                margin: 0 0 0.5rem 0;
                background: linear-gradient(to right, #3b82f6, #8b5cf6);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -0.03em;
              }
              
              .app-subtitle {
                color: var(--color-text-secondary);
                margin: 0;
                font-size: 1.1rem;
              }
              
              .header-nav {
                display: flex;
                gap: 0.75rem;
                background: var(--color-surface);
                padding: 0.5rem;
                border-radius: var(--radius-full);
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
              }
              
              .nav-btn {
                background: transparent;
                border: none;
                color: var(--color-text-secondary);
                cursor: pointer;
                padding: 0.75rem;
                border-radius: 50%;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              
              .nav-btn:hover {
                color: var(--color-primary);
                background: rgba(255,255,255,0.1);
                transform: translateY(-2px);
              }
              
              @media (max-width: 640px) {
                  .app-header {
                      flex-direction: row;
                      justify-content: space-between;
                      align-items: center;
                      gap: 0.75rem;
                      margin-bottom: 1rem;
                      padding-bottom: 1rem;
                      border-bottom: 1px solid rgba(255,255,255,0.05);
                  }
                  
                  .header-content {
                      text-align: left;
                      flex: 1;
                      min-width: 0; /* Allow content to shrink */
                  }
                  
                  .app-title {
                      font-size: 1.25rem;
                      margin: 0;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                  }
                  
                  .app-subtitle {
                      display: none;
                  }
                  
                  .header-nav {
                      background: transparent;
                      border: none;
                      box-shadow: none;
                      padding: 0;
                      gap: 0;
                      flex-shrink: 0; /* Prevent icons from shrinking */
                  }
                  
                  .nav-btn {
                      padding: 0.4rem;
                  }
                  
                  .nav-btn svg {
                      width: 20px;
                      height: 20px;
                  }
              }
            `}</style>
          </header>
          <Library onSelectBook={handleSelectBook} />
        </>
      )}

      {view === 'reader' && (
        <>
          <nav className="reader-nav" style={{
            opacity: isFocusMode ? 0 : 1,
            pointerEvents: isFocusMode ? 'none' : 'auto',
            display: 'flex',
            alignItems: 'center',
            marginBottom: '1rem',
            transition: 'opacity 0.3s',
            position: isFocusMode ? 'absolute' : 'relative'
          }}>
            <button onClick={handleBackToLibrary} className="btn-back" style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem'
            }}>
              ← Library
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentBook?.title}
            </div>
            <div style={{ width: '80px' }}></div>
          </nav>

          <main className={`reader-main ${isFocusMode ? 'focus-active' : ''}`} style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isFocusMode ? 'center' : 'flex-start',
            flex: 1,
            minHeight: isFocusMode ? '100vh' : 'auto',
            paddingBottom: isFocusMode ? '0' : '280px', /* Prevent overlap with fixed controls */
            transition: 'all 0.3s ease'
          }}>
            <div style={{ position: 'relative' }}>
              <Reader word={currentDisplay} font={font} bionicMode={bionicMode} />

              <button
                onClick={() => setIsFocusMode(!isFocusMode)}
                className="focus-btn"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: isFocusMode ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  color: isFocusMode ? 'white' : 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}
                title="Toggle Focus Mode (Press 'F')"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isFocusMode ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  )}
                </svg>
              </button>
            </div>

            {!isFocusMode && (
              <Controls
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onReset={reset}
                wpm={wpm}
                setWpm={setWpm}
                chunkSize={chunkSize}
                setChunkSize={setChunkSize}
                progress={progress}
                onSeek={handleSeek}
                font={font}
                setFont={setFont}
                timeLeft={timeLeftString}
              />
            )}

            {/* Minimal controls in focus mode */}
            {isFocusMode && (
              <div style={{
                position: 'fixed',
                bottom: '2rem',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '1rem',
                zIndex: 100
              }}>
                <button
                  onClick={togglePlay}
                  style={{
                    background: isPlaying ? 'var(--color-accent)' : 'var(--color-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '72px',
                    height: '72px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    transition: 'all 0.2s'
                  }}
                >
                  {isPlaying ? (
                    <svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </main>

          <style>{`
            @media (max-width: 640px) {
              .reader-main {
                padding-bottom: 320px !important; /* Extra space for bottom controls */
              }
              
              .focus-active {
                padding-bottom: 100px !important;
              }
              
              .focus-btn {
                width: 48px !important;
                height: 48px !important;
              }
            }
          `}</style>
        </>
      )}

      {/* Lazy Loaded Components */}
      <Suspense fallback={<div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading...</div>}>
        {view === 'settings' && (
          <Settings
            onBack={() => {
              setView(currentBook ? 'reader' : 'library');
              refreshSettings();
            }}
            updateTheme={refreshSettings}
          />
        )}
        {view === 'stats' && <Stats onBack={() => setView('library')} />}
        {view === 'gym' && <Gym onBack={() => setView('library')} />}
        {view === 'achievements' && <Achievements onBack={() => setView('library')} />}
      </Suspense>

      <Toaster position="bottom-center" toastOptions={{
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          border: '1px solid rgba(255,255,255,0.1)'
        }
      }} />

      {/* Footer can stay but hidden in reader mode if desired, or simpler */}
      <footer style={{
        marginTop: 'auto',
        paddingTop: '2rem',
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: '0.875rem',
        transition: 'opacity 0.3s',
        opacity: (isFocusMode || view === 'reader') ? 0 : 1
      }}>
        <p>&copy; {new Date().getFullYear()} Speed Reader App</p>
      </footer>
    </div>
  );
}

export default App;
