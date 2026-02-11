import React, { useState, useEffect } from 'react';
import { getUserProgress, updateUserProgress, getSessions } from '../utils/db';
import { checkNewAchievements } from '../utils/achievements';
import { toast } from 'react-hot-toast';
import './Gym.css';

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
                <div className="gym-title-group">
                    <h2>Eye Gym</h2>
                    {bestTime && <div className="gym-best-time">Best: {bestTime.toFixed(2)}s</div>}
                </div>
                <div className="gym-header-spacer"></div>
            </div>

            <div className="instructions">
                Find numbers 1 to 25 in order. Keep your eyes fixed on the center of the grid!
            </div>

            <div className={`timer-display ${isComplete ? 'complete' : ''}`}>
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
        </div>
    );
};
