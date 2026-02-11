import React, { useState, useEffect } from 'react';
import { getUserProgress, updateUserProgress, getSessions } from '../utils/db';
import { checkNewAchievements } from '../utils/achievements';
import { toast } from 'react-hot-toast';

interface GymProps {
    onBack: () => void;
}

const GRID_SIZE = 5;

const createShuffledGrid = (size: number) => {
    const numbers = Array.from({ length: size * size }, (_, i) => i + 1);
    // Fisher-Yates shuffle
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
};

export const Gym: React.FC<GymProps> = ({ onBack }) => {
    const nowMs = () => performance.now();
    const [grid, setGrid] = useState<number[]>(() => createShuffledGrid(GRID_SIZE));
    const [nextNumber, setNextNumber] = useState(1);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const [bestTime, setBestTime] = useState<number | null>(null);

    const resetGame = () => {
        setGrid(createShuffledGrid(GRID_SIZE));
        setNextNumber(1);
        setStartTime(null);
        setTimeElapsed(0);
        setIsComplete(false);
    };

    useEffect(() => {
        getUserProgress().then(p => {
            setBestTime(p.gymBestTime);
        });
    }, []);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (startTime && !isComplete) {
            interval = setInterval(() => {
                setTimeElapsed(nowMs() - startTime);
            }, 50); // fast update for mm:ss:ms
        }
        return () => clearInterval(interval);
    }, [startTime, isComplete]);

    const handleStart = () => {
        setStartTime(nowMs());
    };

    const handleClick = async (num: number) => {
        if (!startTime) handleStart();

        if (num === nextNumber) {
            if (num === GRID_SIZE * GRID_SIZE) {
                // Game Complete
                setIsComplete(true);
                const finalTime = nowMs() - (startTime || nowMs());
                const finalTimeSeconds = finalTime / 1000;

                // Update Progress
                const progress = await getUserProgress();
                let newBestTime = progress.gymBestTime;

                if (newBestTime === null || finalTimeSeconds < newBestTime) {
                    newBestTime = finalTimeSeconds;
                    setBestTime(newBestTime);
                }

                // Get sessions for completeness in stats object
                const sessions = await getSessions();

                const stats = {
                    totalWordsRead: progress.totalWordsRead,
                    peakWpm: progress.peakWpm,
                    currentStreak: progress.currentStreak,
                    longestStreak: progress.longestStreak,
                    sessionCount: sessions.length,
                    dailyGoalMetCount: progress.dailyGoalMetCount,
                    // New Stats
                    totalTimeReadSeconds: 0, // Not tracked here
                    booksFinishedCount: 0, // Not tracked here
                    gymBestTime: newBestTime,
                    lastSessionDuration: 0,
                };

                const newAchievements = checkNewAchievements(stats, progress.unlockedAchievements);

                await updateUserProgress({
                    ...progress,
                    gymBestTime: newBestTime,
                    unlockedAchievements: [...progress.unlockedAchievements, ...newAchievements]
                });

                if (newAchievements.length > 0) {
                    toast.success('New gym achievement unlocked!');
                }

            }
            setNextNumber(prev => prev + 1);
        } else {
            // Optional: Visual shake or error feedback
        }
    };

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const millis = Math.floor((ms % 1000) / 10);
        return `${seconds}.${millis.toString().padStart(2, '0')}s`;
    };

    return (
        <div className="gym-container">
            <div className="gym-header">
                <button className="btn-back" onClick={onBack}>← Back</button>
                <div style={{ textAlign: 'center' }}>
                    <h2>Eye Gym</h2>
                    {bestTime && <div style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>Best: {bestTime.toFixed(2)}s</div>}
                </div>
                <div style={{ width: '60px' }}></div>
            </div>

            <div className="instructions">
                Find numbers 1 to 25 in order. Keep your eyes fixed on the center of the grid!
            </div>

            <div className="timer-display" style={{ color: isComplete ? 'var(--color-primary)' : 'inherit' }}>
                {formatTime(timeElapsed)}
            </div>

            <div className="schulte-grid">
                {grid.map((num, i) => (
                    <button
                        key={i}
                        className={`grid-cell ${num < nextNumber ? 'found' : ''}`}
                        onClick={() => handleClick(num)}

                    >
                        {num}
                    </button>
                ))}
            </div>

            {isComplete && (
                <div className="completion-modal">
                    <h3>Good Job!</h3>
                    <p>Your time: {formatTime(timeElapsed)}</p>
                    <button className="btn-restart" onClick={resetGame}>Play Again</button>
                </div>
            )}

            <style>{`
                .gym-container {
                     max-width: 600px;
                     margin: 0 auto;
                     padding: 1rem;
                     width: 100%;
                     display: flex;
                     flex-direction: column;
                     align-items: center;
                }
                
                .gym-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    margin-bottom: 2rem;
                }

                .btn-back {
                    background: transparent;
                    border: none;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    font-size: 1rem;
                }

                .instructions {
                    color: var(--color-text-secondary);
                    margin-bottom: 1rem;
                    text-align: center;
                    font-size: 0.9rem;
                }

                .timer-display {
                    font-size: 2.5rem;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    margin-bottom: 2rem;
                    font-family: monospace;
                }

                .schulte-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 0.5rem;
                    width: 100%;
                    aspect-ratio: 1;
                    max-width: 400px;
                }

                .grid-cell {
                    background: var(--color-surface);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: var(--radius-md);
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--color-text);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.1s;
                }

                .grid-cell:hover {
                    background: rgba(255,255,255,0.1);
                }

                .grid-cell:active {
                    transform: scale(0.95);
                }

                /* Visual feedback for found numbers - optional, strict Schulte tables usually don't fade, 
                   but for a game 'gamification' it feels good. */
                .grid-cell.found {
                    opacity: 0.3;
                    pointer-events: none;
                }

                .completion-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--color-surface);
                    border: 1px solid var(--color-primary);
                    padding: 2rem;
                    border-radius: var(--radius-lg);
                    text-align: center;
                    box-shadow: 0 10px 50px rgba(0,0,0,0.5);
                    z-index: 100;
                }

                .completion-modal h3 {
                    margin-top: 0;
                    font-size: 2rem;
                    color: var(--color-primary);
                }

                .btn-restart {
                    background: var(--color-primary);
                    color: white;
                    border: none;
                    padding: 0.75rem 2rem;
                    border-radius: var(--radius-full);
                    font-weight: 700;
                    font-size: 1.1rem;
                    cursor: pointer;
                    margin-top: 1rem;
                }
            `}</style>
        </div>
    );
};
