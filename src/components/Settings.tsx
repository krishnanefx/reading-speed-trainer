import React, { useState, useEffect } from 'react';
import { getUserProgress, updateUserProgress, exportUserData, importUserData } from '../utils/db';
import { Auth } from './Auth';
import { toast } from 'react-hot-toast';
import { devError } from '../utils/logger';

interface SettingsProps {
    onBack: () => void;
    updateTheme: () => void; // Trigger app to re-read theme
}

export const Settings: React.FC<SettingsProps> = ({ onBack, updateTheme }) => {
    const [defaultWpm, setDefaultWpm] = useState(300);
    const [defaultChunkSize, setDefaultChunkSize] = useState(1);
    const [defaultFont, setDefaultFont] = useState('mono');
    const [defaultTheme, setDefaultTheme] = useState('default');
    const [bionicMode, setBionicMode] = useState(false);
    const [autoAccelerate, setAutoAccelerate] = useState(false);
    const [dailyGoal, setDailyGoal] = useState(5000);

    useEffect(() => {
        // Load from localStorage
        const savedWpm = localStorage.getItem('defaultWpm');
        if (savedWpm) setDefaultWpm(parseInt(savedWpm, 10));

        const savedChunkSize = localStorage.getItem('defaultChunkSize');
        if (savedChunkSize) setDefaultChunkSize(parseInt(savedChunkSize, 10));

        const savedFont = localStorage.getItem('defaultFont');
        if (savedFont) setDefaultFont(savedFont);

        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) setDefaultTheme(savedTheme);

        const savedBionic = localStorage.getItem('bionicMode');
        if (savedBionic) setBionicMode(savedBionic === 'true');

        const savedAuto = localStorage.getItem('autoAccelerate');
        if (savedAuto) setAutoAccelerate(savedAuto === 'true');

        // Load daily goal from IndexedDB
        getUserProgress().then(progress => {
            setDailyGoal(progress.dailyGoal);
        });
    }, []);

    const handleSave = async () => {
        localStorage.setItem('defaultWpm', defaultWpm.toString());
        localStorage.setItem('defaultChunkSize', defaultChunkSize.toString());
        localStorage.setItem('defaultFont', defaultFont);
        localStorage.setItem('theme', defaultTheme);
        localStorage.setItem('bionicMode', bionicMode.toString());
        localStorage.setItem('autoAccelerate', autoAccelerate.toString());

        // Save daily goal to IndexedDB
        await updateUserProgress({ dailyGoal });

        // Apply theme immediately
        document.documentElement.setAttribute('data-theme', defaultTheme);
        updateTheme(); // Notify parent content might need refresh
        onBack();
    };

    const handleExport = async () => {
        try {
            const jsonString = await exportUserData();
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `speed-reader-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            devError('Export failed:', error);
            toast.error('Failed to export data.');
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const success = await importUserData(text);
            if (success) {
                toast.success('Data restored successfully. Reloading...');
                window.location.reload();
            } else {
                toast.error('Failed to restore data. Invalid backup format.');
            }
        } catch (error) {
            devError('Import failed:', error);
            toast.error('Failed to read backup file.');
        }
    };

    return (
        <div className="settings-container">
            <div className="settings-header">
                <button className="btn-back" onClick={onBack}>← Back</button>
                <h2>Settings</h2>
                <div style={{ width: '60px' }}></div>
            </div>

            <div className="settings-content">
                {/* Account Section */}
                <h3 className="section-title">Account & Sync</h3>
                <Auth />

                {/* Appearance Section */}
                <h3 className="section-title">Appearance</h3>

                <div className="setting-item">
                    <label>Theme</label>
                    <div className="theme-options">
                        {['default', 'light', 'sepia', 'oled'].map(t => (
                            <button
                                key={t}
                                className={`btn-theme ${defaultTheme === t ? 'active' : ''}`}
                                onClick={() => {
                                    setDefaultTheme(t);
                                    document.documentElement.setAttribute('data-theme', t);
                                }}
                                data-theme={t}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-item">
                    <label>Visual Helpers</label>

                    <div className="toggle-row" onClick={() => setBionicMode(!bionicMode)} style={{ marginBottom: '1rem' }}>
                        <div className={`checkbox ${bionicMode ? 'checked' : ''}`}></div>
                        <span>Bionic Reading (Highlight start of words)</span>
                    </div>

                    <div className="toggle-row" onClick={() => setAutoAccelerate(!autoAccelerate)}>
                        <div className={`checkbox ${autoAccelerate ? 'checked' : ''}`}></div>
                        <span>Auto-Accelerate (+10 WPM every 30s)</span>
                    </div>
                </div>

                {/* Defaults Section */}
                <h3 className="section-title">Reading Defaults</h3>

                <div className="setting-item">
                    <label>Default Speed (WPM)</label>
                    <div className="setting-control">
                        <input
                            type="number"
                            value={defaultWpm}
                            onChange={(e) => setDefaultWpm(Number(e.target.value))}
                            min="60" max="2000" step="10"
                        />
                        <span className="unit">words/min</span>
                    </div>
                </div>

                <div className="setting-item">
                    <label>Default Chunk Size</label>
                    <div className="chunk-options">
                        {[1, 2, 3].map(size => (
                            <button
                                key={size}
                                className={`btn-option ${defaultChunkSize === size ? 'active' : ''}`}
                                onClick={() => setDefaultChunkSize(size)}
                            >
                                {size}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-item">
                    <label>Default Font</label>
                    <div className="chunk-options">
                        {['sans', 'serif', 'mono'].map(f => (
                            <button
                                key={f}
                                className={`btn-option ${defaultFont === f ? 'active' : ''}`}
                                onClick={() => setDefaultFont(f)}
                                style={{ fontFamily: f === 'mono' ? 'monospace' : f === 'serif' ? 'serif' : 'sans-serif', textTransform: 'capitalize' }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Goals Section */}
                <h3 className="section-title">Goals</h3>

                <div className="setting-item">
                    <label>Daily Reading Goal</label>
                    <div className="setting-control">
                        <input
                            type="number"
                            value={dailyGoal}
                            onChange={(e) => setDailyGoal(Number(e.target.value))}
                            min="100" max="100000" step="500"
                        />
                        <span className="unit">words/day</span>
                    </div>
                </div>

                {/* Data Management Section */}
                <h3 className="section-title">Data & Backup</h3>

                <div className="setting-item">
                    <label>Manual Backup</label>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                        Save your progress and books to a file, or restore from a backup.
                    </p>
                    <div className="chunk-options">
                        <button className="btn-option" onClick={handleExport} style={{ width: 'auto', padding: '0.75rem 1.5rem' }}>
                            Download Backup
                        </button>
                        <button className="btn-option" onClick={() => document.getElementById('import-file')?.click()} style={{ width: 'auto', padding: '0.75rem 1.5rem' }}>
                            Restore Backup
                        </button>
                        <button className="btn-option active" onClick={async () => {
                            const { getBooks, saveBook, syncFromCloud } = await import('../utils/db');
                            const books = await getBooks();
                            for (const book of books) {
                                await saveBook(book); // Triggers upsert to Supabase
                            }
                            await syncFromCloud(); // Pull any others
                            toast.success(`Synced ${books.length} books to cloud.`);
                        }} style={{ width: 'auto', padding: '0.75rem 1.5rem' }}>
                            Force Cloud Sync
                        </button>
                        <input
                            id="import-file"
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                    </div>
                </div>

                <button className="btn-save" onClick={handleSave}>Save Settings</button>
            </div>

            <style>{`
        .settings-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 1rem;
        }

        .settings-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
        }

        .btn-back {
            background: transparent;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            font-size: 1rem;
        }
        
        .section-title {
            color: var(--color-primary);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 1.5rem;
            margin-top: 0.5rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 0.5rem;
        }

        .settings-content {
            background: var(--color-surface);
            padding: 2rem;
            border-radius: var(--radius-lg);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .setting-item {
            margin-bottom: 2rem;
        }

        .setting-item label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }

        .theme-options {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem;
        }
        
        .btn-theme {
            padding: 0.75rem;
            border-radius: var(--radius-sm);
            border: 2px solid transparent;
            cursor: pointer;
            font-weight: 600;
            background: var(--color-bg); 
            color: var(--color-text);
            /* We can't easily preview pure CSS vars here without inline styles, 
               so we'll rely on the class UI state */
             opacity: 0.7;
        }
        
        .btn-theme.active {
            border-color: var(--color-primary);
            opacity: 1;
        }

        .toggle-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            cursor: pointer;
        }
        
        .checkbox {
            width: 24px;
            height: 24px;
            border-radius: 6px;
            border: 2px solid var(--color-text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        .checkbox.checked {
            background: var(--color-primary);
            border-color: var(--color-primary);
        }
        
        .checkbox.checked::after {
            content: '✓';
            color: white;
            font-size: 14px;
        }

        .setting-control {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .setting-control input {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 0.5rem;
            border-radius: var(--radius-sm);
            color: var(--color-text);
            font-size: 1.1rem;
            width: 100px;
        }

        .unit {
            color: var(--color-text-secondary);
            font-size: 0.9rem;
        }

        .chunk-options {
            display: flex;
            gap: 0.5rem;
        }

        .btn-option {
            flex: 1;
            padding: 0.75rem;
            background: rgba(255,255,255,0.05);
            border-radius: var(--radius-sm);
            color: var(--color-text-secondary);
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-option:hover {
            background: rgba(255,255,255,0.1);
        }

        .btn-option.active {
            background: var(--color-primary);
            color: white;
            border-color: var(--color-primary);
        }

        .btn-save {
            width: 100%;
            padding: 1rem;
            background: var(--color-primary);
            color: white;
            border: none;
            border-radius: var(--radius-full);
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 1rem;
        }

        .btn-save:hover {
            background: var(--color-primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
      `}</style>
        </div>
    );
};
