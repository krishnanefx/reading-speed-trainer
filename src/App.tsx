import { useState, useEffect, useRef } from 'react';
import Reader from './components/Reader';
import Controls from './components/Controls';
import Library from './components/Library';
import { Settings } from './components/Settings';
import { Stats } from './components/Stats';
import { Gym } from './components/Gym';
import { Achievements } from './components/Achievements';
import { useReader } from './hooks/useReader';
import { updateBookProgress, logSession, getUserProgress, updateUserProgress, getSessions, getBooks } from './utils/db';
import type { Book } from './utils/db';
import { checkNewAchievements } from './utils/achievements';

function App() {
  const [view, setView] = useState<'library' | 'reader' | 'settings' | 'stats' | 'gym' | 'achievements'>('library');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

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

  // Initialize global settings
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'default';
    document.documentElement.setAttribute('data-theme', theme);

    const savedBionic = localStorage.getItem('bionicMode');
    setBionicMode(savedBionic === 'true');

    const savedAuto = localStorage.getItem('autoAccelerate');
    setAutoAccelerate(savedAuto === 'true');
  }, []);

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

    // TODO: Show toast notification for new achievements
    if (newAchievements.length > 0) {
      console.log('🏆 New achievements unlocked:', newAchievements);
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

  // Sync progress to DB
  useEffect(() => {
    if (currentBook && words.length > 0) {
      // Save progress and current WPM
      updateBookProgress(currentBook.id, progress, currentIndex, wpm);
      updateBookProgress(currentBook.id, progress, latestIndexRef.current, wpm);
    }
  }, [currentIndex, currentBook, words.length, progress, wpm]);

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
  };

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
          <header style={{ marginBottom: '2rem', textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setView('gym')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
                title="Eye Gym"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
              <button
                onClick={() => setView('achievements')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
                title="Achievements"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </button>
              <button
                onClick={() => setView('stats')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
                title="Statistics"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button
                onClick={() => setView('settings')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
                title="Settings"
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Speed Reader
            </h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Master the art of rapid reading.</p>
          </header>
          <Library onSelectBook={handleSelectBook} />
        </>
      )}

      {view === 'settings' && (
        <Settings onBack={() => setView('library')} updateTheme={refreshSettings} />
      )}

      {view === 'stats' && (
        <Stats onBack={() => setView('library')} />
      )}

      {view === 'gym' && (
        <Gym onBack={() => setView('library')} />
      )}

      {view === 'achievements' && (
        <Achievements onBack={() => setView('library')} />
      )}

      {view === 'reader' && (
        <>
          <nav className="reader-nav" style={{
            opacity: isFocusMode ? 0 : 1,
            pointerEvents: isFocusMode ? 'none' : 'auto',
            display: 'flex',
            alignItems: 'center',
            marginBottom: '1rem',
            transition: 'opacity 0.3s'
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
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 600 }}>
              {currentBook?.title}
            </div>
            <div style={{ width: '80px' }}></div> {/* Spacer for centering */}
          </nav>

          <main style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isFocusMode ? 'center' : 'flex-start',
            flex: 1,
            minHeight: isFocusMode ? '80vh' : 'auto'
          }}>
            <div style={{ position: 'relative' }}>
              <Reader word={currentDisplay} font={font} bionicMode={bionicMode} />

              <button
                onClick={() => setIsFocusMode(!isFocusMode)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  transition: 'all 0.2s'
                }}
                title="Toggle Focus Mode (Press 'F')"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isFocusMode ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  )}
                </svg>
              </button>
            </div>

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
          </main>
        </>
      )}

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
