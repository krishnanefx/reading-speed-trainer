import React, { useEffect, useState } from 'react';
import { getSessions, clearSessions } from '../utils/db';
import type { Session } from '../utils/db';
import { toast } from 'react-hot-toast';

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

            <style>{`
                .stats-container {
                     max-width: 800px;
                     margin: 0 auto;
                     padding: 1rem;
                     width: 100%;
                }
                
                .stats-header {
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

                .btn-reset {
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .btn-reset:hover {
                    background: rgba(255,0,0,0.2);
                    border-color: rgba(255,0,0,0.5);
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 3rem;
                }
                .confirm-banner {
                    display: flex;
                    gap: 0.5rem;
                    align-items: center;
                    justify-content: center;
                    background: rgba(225, 29, 72, 0.12);
                    border: 1px solid rgba(225, 29, 72, 0.45);
                    border-radius: var(--radius-md);
                    padding: 0.65rem;
                    margin-bottom: 1rem;
                    font-size: 0.9rem;
                }
                .confirm-banner button {
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: var(--radius-sm);
                    padding: 0.35rem 0.65rem;
                }

                .stat-card {
                    background: var(--color-surface);
                    padding: 2rem;
                    border-radius: var(--radius-lg);
                    text-align: center;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: var(--shadow-md);
                }
                .skeleton-card {
                    min-height: 140px;
                    position: relative;
                    overflow: hidden;
                    background: rgba(255,255,255,0.04);
                }
                .skeleton-card::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    transform: translateX(-100%);
                    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 100%);
                    animation: statsShimmer 1.2s ease-in-out infinite;
                }

                .stat-value {
                    font-size: 2.5rem;
                    font-weight: 800;
                    margin-bottom: 0.5rem;
                    background: linear-gradient(to right, var(--color-primary), #8b5cf6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .stat-label {
                    color: var(--color-text-secondary);
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .chart-container {
                    background: var(--color-surface);
                    padding: 1.5rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid rgba(255,255,255,0.1);
                    overflow: hidden;
                }

                .chart-container h3 {
                    margin-top: 0;
                    margin-bottom: 1.5rem;
                    font-size: 1.25rem;
                }

                .bar-chart {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    height: 180px;
                    gap: 0.5rem;
                    width: 100%;
                    overflow: hidden;
                }

                .bar-column {
                    flex: 1;
                    min-width: 0;
                    max-width: 60px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                }

                .bar-wrapper {
                    flex: 1;
                    width: 100%;
                    max-width: 40px;
                    background: rgba(255,255,255,0.05);
                    border-radius: var(--radius-sm);
                    position: relative;
                    display: flex;
                    align-items: flex-end;
                    overflow: hidden;
                }

                .bar-fill {
                    width: 100%;
                    background: var(--color-primary);
                    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
                    min-height: 4px; /* Ensure visible */
                    transition: height 0.5s ease;
                }
                .bar-fill.skeleton-bar {
                    height: 35%;
                    background: rgba(255,255,255,0.2);
                }
                @keyframes statsShimmer {
                    100% {
                        transform: translateX(100%);
                    }
                }

                .bar-label {
                    margin-top: 0.75rem;
                    font-size: 0.8rem;
                    color: var(--color-text-secondary);
                }
                
                /* Mobile Stats Adjustments */
                @media (max-width: 640px) {
                    .stats-container {
                        padding: 0.5rem;
                    }
                    
                    .stats-grid {
                        grid-template-columns: 1fr;
                        gap: 1rem;
                    }
                    
                    .stat-card {
                        padding: 1.25rem;
                    }
                    
                    .stat-value {
                        font-size: 2rem;
                    }
                    
                    .chart-container {
                        padding: 1rem;
                    }
                    
                    .bar-chart {
                        height: 150px;
                        gap: 0.25rem;
                    }
                    
                    .bar-column {
                        max-width: 40px;
                    }
                    
                    .bar-wrapper {
                        max-width: 30px;
                    }
                    
                    .bar-label {
                        font-size: 0.7rem;
                    }
                }
            `}</style>
        </div>
    );
};
