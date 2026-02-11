import React, { useEffect, useState } from 'react';
import { getUserProgress, getSessions } from '../utils/db';
import type { UserProgress } from '../utils/db';
import { ACHIEVEMENTS } from '../utils/achievements';

interface AchievementsProps {
    onBack: () => void;
}

export const Achievements: React.FC<AchievementsProps> = ({ onBack }) => {
    const [progress, setProgress] = useState<UserProgress | null>(null);
    const [sessionCount, setSessionCount] = useState(0);

    useEffect(() => {
        void getUserProgress().then(setProgress);
        void getSessions().then((sessions) => setSessionCount(sessions.length));
    }, []);

    if (!progress) {
        return <div className="achievements-container">Loading...</div>;
    }

    const unlockedSet = new Set(progress.unlockedAchievements);

    return (
        <div className="achievements-container">
            <div className="achievements-header">
                <button className="btn-back" onClick={onBack}>← Back</button>
                <h2>Achievements</h2>
                <div style={{ width: '60px' }}></div>
            </div>

            <div className="summary-row">
                <div className="summary-item">
                    <span className="fire-icon">🔥</span>
                    <span className="summary-value">{progress.currentStreak}</span>
                    <span className="summary-label">Day Streak</span>
                </div>
                <div className="summary-item">
                    <span className="summary-value">{progress.longestStreak}</span>
                    <span className="summary-label">Best Streak</span>
                </div>
                <div className="summary-item">
                    <span className="summary-value">{unlockedSet.size}/{ACHIEVEMENTS.length}</span>
                    <span className="summary-label">Unlocked</span>
                </div>
            </div>

            <div className="achievements-grid">
                {ACHIEVEMENTS.map(achievement => {
                    const isUnlocked = unlockedSet.has(achievement.id);
                    return (
                        <div
                            key={achievement.id}
                            className={`achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`}
                            title={achievement.description}
                        >
                            <div className="achievement-icon">{achievement.icon}</div>
                            <div className="achievement-name">{achievement.name}</div>
                            <div className="achievement-desc">{achievement.description}</div>
                        </div>
                    );
                })}
            </div>

            <div className="progress-stats">
                <p><strong>Total Words Read:</strong> {progress.totalWordsRead.toLocaleString()}</p>
                <p><strong>Peak WPM:</strong> {progress.peakWpm}</p>
                <p><strong>Sessions:</strong> {sessionCount}</p>
                <p><strong>Daily Goals Met:</strong> {progress.dailyGoalMetCount}</p>
            </div>

            <style>{`
                .achievements-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 1rem;
                    width: 100%;
                }
                
                .achievements-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2rem;
                }

                .btn-back {
                    background: transparent;
                    border: none;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    font-size: 1rem;
                }

                .summary-row {
                    display: flex;
                    justify-content: center;
                    gap: 2rem;
                    margin-bottom: 2rem;
                    flex-wrap: wrap;
                }

                .summary-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    background: var(--color-surface);
                    padding: 1rem 2rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid rgba(255,255,255,0.1);
                }

                .fire-icon {
                    font-size: 1.5rem;
                    margin-bottom: 0.25rem;
                }

                .summary-value {
                    font-size: 2rem;
                    font-weight: 800;
                    background: linear-gradient(to right, var(--color-primary), #8b5cf6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .summary-label {
                    color: var(--color-text-secondary);
                    font-size: 0.8rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .achievements-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .achievement-card {
                    background: var(--color-surface);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: var(--radius-lg);
                    padding: 1.5rem 1rem;
                    text-align: center;
                    transition: all 0.3s;
                }

                .achievement-card.locked {
                    opacity: 0.4;
                    filter: grayscale(100%);
                }

                .achievement-card.unlocked {
                    box-shadow: 0 0 20px rgba(59, 130, 246, 0.2);
                    border-color: var(--color-primary);
                }

                .achievement-icon {
                    font-size: 2.5rem;
                    margin-bottom: 0.5rem;
                }

                .achievement-name {
                    font-weight: 700;
                    margin-bottom: 0.25rem;
                }

                .achievement-desc {
                    font-size: 0.8rem;
                    color: var(--color-text-secondary);
                }

                .progress-stats {
                    background: var(--color-surface);
                    padding: 1.5rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid rgba(255,255,255,0.1);
                }

                .progress-stats p {
                    margin: 0.5rem 0;
                }
            `}</style>
        </div>
    );
};
