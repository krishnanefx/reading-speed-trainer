import React from 'react';

interface ReaderProps {
  word: string;
  font: string;
  bionicMode?: boolean;
}

const Reader: React.FC<ReaderProps> = ({ word, font, bionicMode = false }) => {
  const getFontFamily = () => {
    switch (font) {
      case 'serif': return '"Merriweather", "Georgia", serif';
      case 'mono': return '"Fira Code", "Courier New", monospace';
      default: return '"Inter", system-ui, sans-serif';
    }
  };

  const renderBionic = (text: string) => {
    const words = text.split(' ');
    return words.map((w, i) => {
      if (!w.trim()) return null;
      // Determine split point (first half bold)
      const split = Math.ceil(w.length / 2);
      const firstHalf = w.slice(0, split);
      const secondHalf = w.slice(split);

      return (
        <span key={i} style={{ display: 'inline-block', marginRight: '0.25em' }}>
          <b style={{ fontWeight: 800, color: 'var(--color-text)' }}>{firstHalf}</b>
          <span style={{ opacity: 0.85 }}>{secondHalf}</span>
        </span>
      );
    });
  };

  return (
    <div className="reader-display">
      <div
        className="word-container"
        style={{ fontFamily: getFontFamily() }}
      >
        {bionicMode ? renderBionic(word) : word}
      </div>

      {/* Guiding Lines for visual focus */}
      <div className="guide-lines">
        <div className="guide-line top"></div>
        <div className="guide-line bottom"></div>
      </div>

      <style>{`
        .reader-display {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          min-height: 300px;
          user-select: none;
        }

        .word-container {
          font-size: 5rem;
          font-weight: 500;
          text-align: center;
          line-height: 1.2;
          z-index: 2;
          padding: 2rem;
          /* Ensure text handles wrapping if chunk size is large */
          max-width: 100%;
          word-break: break-word;
        }

        .guide-lines {
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 120px; /* Approximate height of text */
            transform: translateY(-50%);
            border-top: 2px solid rgba(255,255,255,0.05);
            border-bottom: 2px solid rgba(255,255,255,0.05);
            pointer-events: none;
        }

        @media (max-width: 600px) {
            .word-container {
                font-size: 3.5rem;
            }
        }
      `}</style>
    </div>
  );
};

export default Reader;
