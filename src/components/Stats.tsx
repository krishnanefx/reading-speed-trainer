import React, { useEffect, useState } from 'react';
import { getSessions, clearSessions } from '../utils/db';
import type { Session } from '../utils/db';
import { toast } from 'react-hot-toast';
import './Stats.css';

interface StatsProps {
    onBack: () => void;
}

export const Stats: React.FC<StatsProps> = ({ onBack }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [confirmReset, setConfirmReset] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        void getSessions().then((loaded) => {
            if (mounted) setSessions(loaded);
        }).finally(() => {
            if (mounted) setIsLoading(false);
        });
        return () => {
            mounted = false;
        };
    }, []);

    const handleReset = async () => {
        await clearSessions();
        setSessions([]);
        setConfirmReset(false);
        toast.success('Reading statistics reset.');
    };

    const totalWords = sessions.reduce((acc, s) => acc + s.wordsRead, 0);
    const totalSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const averageWpm = sessions.length > 0
        ? Math.round(sessions.reduce((acc, s) => acc + s.averageWpm, 0) / sessions.length)
        : 0;

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    // Group by day for the last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const statsByDay = last7Days.map(dateStr => {
        const daySessions = sessions.filter(s => {
            return new Date(s.timestamp).toISOString().split('T')[0] === dateStr;
        });
        const words = daySessions.reduce((acc, s) => acc + s.wordsRead, 0);
        return { date: dateStr, words };
    });

    const maxWords = Math.max(...statsByDay.map(d => d.words), 100); // Avoid div by zero

    return (
        <div className="stats-container">
            <div className="stats-header">
                <button className="btn-back" onClick={onBack}>← Back</button>
                <h2>Reading Statistics</h2>
                <button className="btn-reset" onClick={() => setConfirmReset(true)} title="Reset Stats">
                    🗑️
                </button>
            </div>
            {confirmReset && (
                <div className="confirm-banner">
                    <span>Delete all stats? This cannot be undone.</span>
                    <button onClick={handleReset}>Confirm</button>
                    <button onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
            )}

            <div className="stats-grid">
                {isLoading ? (
                    <>
                        <div className="stat-card skeleton-card"></div>
                        <div className="stat-card skeleton-card"></div>
                        <div className="stat-card skeleton-card"></div>
                    </>
                ) : (
                    <>
                        <div className="stat-card">
                            <div className="stat-value">{totalWords.toLocaleString()}</div>
                            <div className="stat-label">Total Words Read</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{hours}h {minutes}m</div>
                            <div className="stat-label">Time Spent Reading</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{averageWpm}</div>
                            <div className="stat-label">Average WPM</div>
                        </div>
                    </>
                )}
            </div>

            <div className="chart-container">
                <h3>Last 7 Days (Words)</h3>
                <div className="bar-chart">
                    {isLoading ? (
                        <>
                            {Array.from({ length: 7 }).map((_, idx) => (
                                <div key={`stats-skeleton-${idx}`} className="bar-column">
                                    <div className="bar-wrapper">
                                        <div className="bar-fill skeleton-bar"></div>
                                    </div>
                                    <div className="bar-label">-</div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {statsByDay.map(day => (
                                <div key={day.date} className="bar-column">
                                    <div className="bar-wrapper">
                                        <div
                                            className="bar-fill"
                                            style={{ height: `${(day.words / maxWords) * 100}%` }}
                                            title={`${day.words} words on ${day.date}`}
                                        ></div>
                                    </div>
                                    <div className="bar-label">
                                        {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

        </div>
    );
};
