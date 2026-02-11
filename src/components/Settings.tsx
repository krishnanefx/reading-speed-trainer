import React, { useState, useEffect } from 'react';
import { getUserProgress, updateUserProgress, exportUserData, importUserData } from '../utils/db';
import { Auth } from './Auth';
import { toast } from 'react-hot-toast';
import { devError } from '../utils/logger';
import './Settings.css';

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
                <div className="settings-header-spacer"></div>
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

                    <div className="toggle-row spaced" onClick={() => setBionicMode(!bionicMode)}>
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
                                className={`btn-option font-option ${defaultFont === f ? 'active' : ''} ${f === 'mono' ? 'font-mono' : f === 'serif' ? 'font-serif' : 'font-sans'}`}
                                onClick={() => setDefaultFont(f)}
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
                    <p className="backup-description">
                        Save your progress and books to a file, or restore from a backup.
                    </p>
                    <div className="chunk-options">
                        <button className="btn-option btn-option-inline" onClick={handleExport}>
                            Download Backup
                        </button>
                        <button className="btn-option btn-option-inline" onClick={() => document.getElementById('import-file')?.click()}>
                            Restore Backup
                        </button>
                        <button className="btn-option active btn-option-inline" onClick={async () => {
                            const { getBooks, saveBook, syncFromCloud } = await import('../utils/db');
                            const books = await getBooks();
                            for (const book of books) {
                                await saveBook(book); // Triggers upsert to Supabase
                            }
                            await syncFromCloud(); // Pull any others
                            toast.success(`Synced ${books.length} books to cloud.`);
                        }}>
                            Force Cloud Sync
                        </button>
                        <input
                            id="import-file"
                            type="file"
                            accept=".json"
                            className="hidden-file-input"
                            onChange={handleImport}
                        />
                    </div>
                </div>

                <button className="btn-save" onClick={handleSave}>Save Settings</button>
            </div>
        </div>
    );
};
