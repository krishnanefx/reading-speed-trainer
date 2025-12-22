import React from 'react';

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
  timeLeft: string;
}

const Controls: React.FC<ControlsProps> = ({
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
  timeLeft
}) => {
  return (
    <div className="controls-container">
      <div className="main-controls">
        <button className="btn-icon" onClick={onReset} title="Reset">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button className={`btn-primary ${isPlaying ? 'playing' : ''}`} onClick={onTogglePlay}>
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
                  style={{ textTransform: 'capitalize' }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <label>Progress</label>
            <label style={{ color: 'var(--color-primary)' }}>
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

      <style>{`
        .controls-container {
          background: var(--color-surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1.5rem;
          border-radius: var(--radius-md);
          margin-bottom: 2rem;
          box-shadow: var(--shadow-glass);
        }

        .main-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 2rem;
          margin-bottom: 1.5rem;
        }

        .btn-primary {
          background: var(--color-primary);
          color: white;
          border-radius: 50%;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-normal);
          box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.5);
        }

        .btn-primary:hover {
          background: var(--color-primary-hover);
          transform: translateY(-2px);
        }
        
        .btn-primary:active {
           transform: translateY(0);
        }
        
        .btn-icon {
          color: var(--color-text-secondary);
          padding: 8px;
          border-radius: 50%;
          transition: var(--transition-normal);
        }

        .btn-icon:hover {
          color: var(--color-text);
          background: rgba(255,255,255,0.05);
        }

        .sliders {
          display: grid;
          gap: 1.5rem;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .control-row {
            display: flex;
            gap: 1rem;
        }
        
        .half {
            flex: 1;
        }

        label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text-secondary);
        }

        input[type=range] {
          width: 100%;
          -webkit-appearance: none;
          background: transparent;
        }
        
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: var(--color-primary);
          cursor: pointer;
          margin-top: -6px;
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
        }
        
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        
        .chunk-options {
          display: flex;
          gap: 0.5rem;
        }
        
        .btn-option {
          flex: 1;
          padding: 0.5rem;
          background: rgba(255,255,255,0.05);
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          border: 1px solid transparent;
          transition: var(--transition-normal);
          font-size: 0.875rem;
        }
        
        .btn-option:hover {
          background: rgba(255,255,255,0.1);
          color: var(--color-text);
        }
        
        .btn-option.active {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }
        
        @media (max-width: 600px) {
            .control-row {
                flex-direction: column;
            }
        }
      `}</style>
    </div>
  );
};

export default Controls;
