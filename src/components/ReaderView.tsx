import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Reader from './Reader';
import Controls from './Controls';
import ShortcutsHelp from './ShortcutsHelp';
import { useReader } from '../hooks/useReader';
import type { Book } from '../utils/db';
import { logSession, updateBookProgress } from '../utils/db';
import { debounce } from '../utils/common';

interface ReaderViewProps {
    book: Book;
    initialWpm: number;
    initialChunkSize: number;
    initialFont: string;
    initialFontSize: number;
    initialBionicMode: boolean;
    initialAutoAccelerate: boolean;
    onBack: () => void;
    onUpdateStats: (wordsRead: number, wpm: number, duration: number) => void;
    onUpdateSettings?: (settings: { wpm?: number; chunkSize?: number; font?: string; fontSize?: number }) => void;
}

const ReaderView: React.FC<ReaderViewProps> = ({
    book,
    initialWpm,
    initialChunkSize,
    initialFont,
    initialFontSize,
    initialBionicMode,
    initialAutoAccelerate,
    onBack,
    onUpdateStats,
    onUpdateSettings
}) => {
    // Local View State
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [wpm, setWpm] = useState(initialWpm);
    const [chunkSize, setChunkSize] = useState(initialChunkSize);
    const [font, setFont] = useState(initialFont);
    const [fontSize, setFontSize] = useState(initialFontSize);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

    // Reader Hook
    const {
        words,
        currentIndex,
        isPlaying,
        currentDisplay,
        togglePlay,
        reset,
        seek,
        setIsPlaying
    } = useReader({ text: book.content || book.text || '', wpm, chunkSize });

    // Session Tracking
    const sessionStartTimeRef = useRef<number | null>(null);
    const wordsReadStartRef = useRef<number>(0);
    const [lastSyncedIndex, setLastSyncedIndex] = useState(book.currentIndex || 0);
    // Refs for stable Event Listeners
    const latestIndexRef = useRef(currentIndex);
    const wordsRef = useRef(words);
    const chunkSizeRef = useRef(chunkSize);
    const wpmRef = useRef(wpm);
    const isFocusModeRef = useRef(isFocusMode);

    // Sync refs
    useEffect(() => {
        latestIndexRef.current = currentIndex;
        wordsRef.current = words;
        chunkSizeRef.current = chunkSize;
        wpmRef.current = wpm;
        isFocusModeRef.current = isFocusMode;
    }, [currentIndex, words, chunkSize, wpm, isFocusMode]);

    // Initial Seek to saved position
    useEffect(() => {
        if ((book.currentIndex || 0) > 0) {
            // Small timeout to allow words to process
            const timer = setTimeout(() => {
                seek(book.currentIndex || 0);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [book.currentIndex, seek]);

    // Auto-Accelerate
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying && initialAutoAccelerate) {
            // Increase WPM by 10 every 30 seconds, up to 2000
            interval = setInterval(() => {
                setWpm(prev => Math.min(prev + 10, 2000));
            }, 30000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, initialAutoAccelerate]);

    // Session Logging Logic
    const handleSessionEnd = useCallback(() => {
        if (sessionStartTimeRef.current) {
            const duration = (Date.now() - sessionStartTimeRef.current) / 1000;
            const wordsRead = Math.max(0, latestIndexRef.current - wordsReadStartRef.current);

            if (duration > 2 && wordsRead > 0) {
                const latestProgress = words.length > 0 ? latestIndexRef.current / words.length : 0;
                void updateBookProgress(book.id, latestProgress, latestIndexRef.current, wpm, true);
                logSession({
                    id: Date.now().toString(),
                    bookId: book.id,
                    timestamp: Date.now(),
                    durationSeconds: duration,
                    wordsRead: wordsRead,
                    averageWpm: wpm
                });
                onUpdateStats(wordsRead, wpm, duration);
            }
            sessionStartTimeRef.current = null;
        }
    }, [book.id, wpm, onUpdateStats, words.length]); // wpm might be average? Using current for now.

    // Watch Play State for Session Start/End
    useEffect(() => {
        if (isPlaying) {
            sessionStartTimeRef.current = Date.now();
            wordsReadStartRef.current = latestIndexRef.current;
        } else {
            handleSessionEnd();
        }
    }, [isPlaying, handleSessionEnd]);

    // Handle Unmount / Book Change
    useEffect(() => {
        return () => {
            if (isPlaying) {
                handleSessionEnd();
            }
        };
    }, [isPlaying, handleSessionEnd]);

    // Debounced Progress Saving
    const saveProgressDebounced = useMemo(
        () => debounce((id: string, prog: number, idx: number, speed: number) => {
            const indexDelta = Math.abs(idx - lastSyncedIndex);
            const shouldCloudSync = indexDelta >= Math.max(40, chunkSize * 20) || prog >= 0.999;
            void updateBookProgress(id, prog, idx, speed, shouldCloudSync);
            if (shouldCloudSync) {
                setLastSyncedIndex(idx);
            }
            onUpdateSettings?.({ wpm: speed }); // Optional: sync WPM back to app/book
        }, 3500),
        [onUpdateSettings, chunkSize, lastSyncedIndex]
    );

    useEffect(() => {
        if (words.length > 0) {
            const progress = currentIndex / words.length;
            saveProgressDebounced(book.id, progress, currentIndex, wpm);
        }
    }, [currentIndex, words.length, book.id, wpm, saveProgressDebounced]);

    // Keyboard Shortcuts (Optimized)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

            const currentIdx = latestIndexRef.current;
            const currentWords = wordsRef.current;
            const currentChunkSize = chunkSizeRef.current;
            const currentWpm = wpmRef.current;
            const focusMode = isFocusModeRef.current;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlay(); // togglePlay is stable
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setWpm(Math.min(currentWpm + 10, 2000));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    setWpm(Math.max(currentWpm - 10, 60));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    seek(Math.min(currentIdx + 10 * currentChunkSize, currentWords.length - 1));
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    seek(Math.max(currentIdx - 10 * currentChunkSize, 0));
                    break;
                case 'Home':
                    e.preventDefault();
                    seek(0);
                    break;
                case 'End':
                    e.preventDefault();
                    seek(currentWords.length - 1);
                    break;
                case 'KeyF':
                    e.preventDefault();
                    setIsFocusMode(!focusMode);
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (isShortcutsOpen) setIsShortcutsOpen(false);
                    else if (focusMode) setIsFocusMode(false);
                    else onBack();
                    break;
                case 'Slash':
                    if (e.shiftKey) {
                        e.preventDefault();
                        setIsShortcutsOpen(true);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, seek, onBack, isShortcutsOpen]); // Minimized dependencies

    // Display Helpers
    const wordsLeft = Math.max(0, words.length - currentIndex);
    const minutesLeft = Math.ceil(wordsLeft / wpm);
    let timeLeftString = '';
    if (wordsLeft === 0) timeLeftString = 'Finished';
    else if (minutesLeft < 60) timeLeftString = `${minutesLeft} min left`;
    else timeLeftString = `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m left`;

    const progress = words.length > 0 ? currentIndex / words.length : 0;

    const handleSeek = useCallback((val: number) => {
        setIsPlaying(false);
        const idx = Math.floor(val * words.length);
        seek(idx);
    }, [words.length, seek, setIsPlaying]);

    return (
        <>
            {/* Navigation Bar */}
            <nav className="reader-nav" style={{
                opacity: isFocusMode ? 0 : 1,
                pointerEvents: isFocusMode ? 'none' : 'auto',
                display: 'flex',
                alignItems: 'center',
                marginBottom: '1rem',
                transition: 'opacity 0.3s',
                position: isFocusMode ? 'absolute' : 'relative',
                zIndex: 10
            }}>
                <button onClick={onBack} className="btn-back" style={{
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
                    {book.title}
                </div>
                <button
                    onClick={() => setIsShortcutsOpen(true)}
                    className="btn-back"
                    style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'var(--color-text-secondary)',
                        borderRadius: '999px',
                        padding: '0.35rem 0.65rem',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}
                    title="Keyboard shortcuts (?)"
                    aria-label="Open keyboard shortcuts"
                >
                    ?
                </button>
            </nav>

            {/* Main Reader Area */}
            <main className={`reader-main ${isFocusMode ? 'focus-active' : ''}`} style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: isFocusMode ? 'center' : 'flex-start',
                flex: 1,
                minHeight: isFocusMode ? '100vh' : 'auto',
                paddingBottom: isFocusMode ? '0' : '280px',
                transition: 'all 0.3s ease'
            }}>
                <div style={{ position: 'relative' }}>
                    <Reader word={currentDisplay} font={font} bionicMode={initialBionicMode} fontSize={fontSize} />

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
                        fontSize={fontSize}
                        setFontSize={setFontSize}
                        timeLeft={timeLeftString}
                    />
                )}

                {/* Minimal Focus Controls */}
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

            {/* Local Styles for Mobile Responsiveness */}
            <style>{`
            @media (max-width: 640px) {
              .reader-main {
                padding-bottom: 320px !important;
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
            <ShortcutsHelp isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
        </>
    );
};

export default React.memo(ReaderView);
