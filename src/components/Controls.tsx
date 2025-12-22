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
  fontSize: number;
  setFontSize: (size: number) => void;
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
  fontSize,
  setFontSize,
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
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1.5rem;
          border-radius: var(--radius-lg);
          margin-bottom: 2rem;
          box-shadow: var(--shadow-glass);
          transition: all 0.3s ease;
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
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-normal);
          box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.5);
          border: 4px solid rgba(255,255,255,0.1);
        }

        .btn-primary.playing {
            background: var(--color-accent);
            box-shadow: 0 4px 14px 0 rgba(225, 29, 72, 0.5);
        }

        .btn-primary:active {
           transform: scale(0.95);
        }
        
        .btn-icon {
          color: var(--color-text-secondary);
          padding: 12px;
          border-radius: 50%;
          transition: var(--transition-normal);
          background: rgba(255,255,255,0.05);
        }

        .btn-icon:hover {
          color: var(--color-text);
          background: rgba(255,255,255,0.15);
          transform: translateY(-2px);
        }

        .sliders {
          display: grid;
          gap: 1.5rem;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .control-row {
            display: flex;
            gap: 1rem;
        }
        
        .half {
            flex: 1;
        }
        
        .full {
            width: 100%;
        }

        label {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Improved Range Slider */
        input[type=range] {
          width: 100%;
          -webkit-appearance: none;
          background: transparent;
          height: 24px; /* Larger touch target area */
          margin: 0;
        }
        
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: var(--color-primary);
          cursor: pointer;
          margin-top: -10px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          border: 2px solid white;
        }
        
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
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
          transition: var(--transition-normal);
          font-size: 0.9rem;
          font-weight: 500;
        }
        
        .btn-option.active {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }
        
        /* --- Mobile Overhaul --- */
        @media (max-width: 640px) {
            .controls-container {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                margin: 0;
                border-radius: 24px 24px 0 0;
                border: none;
                border-top: 1px solid rgba(255,255,255,0.1);
                padding: 1.5rem;
                padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
                z-index: 100;
                background: rgba(15, 23, 42, 0.95); /* More solid for contrast */
                box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
            }
            
            /* Hide secondary controls initially or make them compact? 
               For now, stack them but make main controls prominent. */
               
            .main-controls {
                margin-bottom: 2rem;
                justify-content: space-between; /* Spread reset/play */
                padding: 0 1rem;
            }
            
            .btn-primary {
                width: 80px;
                height: 80px; /* Huge play button */
            }
            
            .control-row {
                display: none; /* Hide font/chunk options on main screen to save space? Or put in a modal? 
                                  User said "horrendous", clutter is a big factor. 
                                  Let's keep WPM and Progress, hide Font/Chunk details often used less.
                               */
            }
            
            /* We need a way to show them back though. 
               Maybe just wrap them or scroll? 
               Let's just stack properly for now and rely on scroll if needed, 
               but fixed height container is risky.
            */
            
            .control-row {
                display: flex; /* Restore it */
                gap: 0.5rem;
            }
            
            .main-controls {
                order: -1; /* Ensure top */
            }
            
            /* If we want a really clean UI, we might want to put settings in a slide-up.
               But for this task, just cleaning the layout: */
            
            .sliders {
                gap: 1.5rem;
                max-height: 40vh;
                overflow-y: auto;
                padding-bottom: 1rem;
            }
        }
      `}</style>
    </div>
  );
};

export default Controls;
