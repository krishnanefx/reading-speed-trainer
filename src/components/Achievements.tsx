import React, { useEffect, useState } from 'react';
import { getUserProgress, getSessions } from '../utils/db/index';
import type { UserProgress } from '../utils/db/index';
import { ACHIEVEMENTS } from '../utils/achievements';
import './Achievements.css';

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
                <div className="achievements-header-spacer"></div>
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
        </div>
    );
};
