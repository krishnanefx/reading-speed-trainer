import React, { useEffect, useState } from 'react';
import { getSessions, clearSessions } from '../utils/db';
import type { Session } from '../utils/db';

interface StatsProps {
    onBack: () => void;
}

export const Stats: React.FC<StatsProps> = ({ onBack }) => {
    const [sessions, setSessions] = useState<Session[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await getSessions();
        setSessions(data);
    };

    const handleReset = async () => {
        if (confirm("Are you sure you want to delete all reading statistics? This cannot be undone.")) {
            await clearSessions();
            loadData();
        }
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
                <button className="btn-reset" onClick={handleReset} title="Reset Stats">
                    🗑️
                </button>
            </div>

            <div className="stats-grid">
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
            </div>

            <div className="chart-container">
                <h3>Last 7 Days (Words)</h3>
                <div className="bar-chart">
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

                .stat-card {
                    background: var(--color-surface);
                    padding: 2rem;
                    border-radius: var(--radius-lg);
                    text-align: center;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: var(--shadow-md);
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
                    padding: 2rem;
                    border-radius: var(--radius-lg);
                    border: 1px solid rgba(255,255,255,0.1);
                }

                .chart-container h3 {
                    margin-top: 0;
                    margin-bottom: 2rem;
                    font-size: 1.25rem;
                }

                .bar-chart {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    height: 200px;
                    gap: 1rem;
                }

                .bar-column {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                }

                .bar-wrapper {
                    flex: 1;
                    width: 100%;
                    width: 40px; 
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

                .bar-label {
                    margin-top: 0.75rem;
                    font-size: 0.8rem;
                    color: var(--color-text-secondary);
                }
            `}</style>
        </div>
    );
};
