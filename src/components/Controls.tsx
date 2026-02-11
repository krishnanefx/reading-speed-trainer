import React, { useState } from 'react';
import ShortcutsHelp from './ShortcutsHelp';
import './Controls.css';

interface ControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  wpm: number;
  setWpm: (wpm: number) => void;
  chunkSize: number;
  setChunkSize: (size: number) => void;
  progress: number; // 0 to 1
  onSeek: (value: number) => void;
  font: string;
  setFont: (font: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  timeLeft: string;
}

const ControlsComponent: React.FC<ControlsProps> = ({
  isPlaying,
  onTogglePlay,
  onReset,
  wpm,
  setWpm,
  chunkSize,
  setChunkSize,
  progress,
  onSeek,
  font,
  setFont,
  fontSize,
  setFontSize,
  timeLeft
}) => {
  const [showShortcuts, setShowShortcuts] = useState(false);

  return (
    <div className="controls-container">
      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <div className="main-controls">
        <button className="btn-icon" onClick={onReset} title="Reset" aria-label="Reset reader progress">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button className="btn-icon" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts" aria-label="Open keyboard shortcuts">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>

        <button className={`btn-primary ${isPlaying ? 'playing' : ''}`} onClick={onTogglePlay} aria-label={isPlaying ? 'Pause reading' : 'Start reading'}>
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

      <div className="sliders">
        <div className="control-group">
          <label>Speed: {wpm} WPM</label>
          <input
            type="range"
            min="60"
            max="1000"
            step="10"
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))}
          />
        </div>

        <div className="control-row">
          <div className="control-group half">
            <label>Chunk Size</label>
            <div className="chunk-options">
              {[1, 2, 3].map(size => (
                <button
                  key={size}
                  className={`btn-option ${chunkSize === size ? 'active' : ''}`}
                  onClick={() => setChunkSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group half">
            <label>Font</label>
            <div className="chunk-options">
              {['sans', 'serif', 'mono'].map(f => (
                <button
                  key={f}
                  className={`btn-option ${font === f ? 'active' : ''}`}
                  onClick={() => setFont(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="control-row">
          <div className="control-group full">
            <label>Text Size</label>
            <div className="chunk-options">
              {[1, 2, 3, 4, 5].map(size => (
                <button
                  key={size}
                  className={`btn-option ${fontSize === size ? 'active' : ''}`}
                  onClick={() => setFontSize(size)}
                  title={['Extra Small', 'Small', 'Medium', 'Large', 'Extra Large'][size - 1]}
                >
                  {['XS', 'S', 'M', 'L', 'XL'][size - 1]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="control-group">
          <div className="progress-label-row">
            <label>Progress</label>
            <label className="progress-meta-label">
              {Math.round(progress * 100)}% • {timeLeft}
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={progress * 100}
            onChange={(e) => onSeek(Number(e.target.value) / 100)}
          />
        </div>
      </div>

    </div>
  );
};

const Controls = React.memo(ControlsComponent);
export default Controls;
