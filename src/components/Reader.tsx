import React from 'react';

interface ReaderProps {
  word: string;
  font: string;
  bionicMode?: boolean;
  fontSize?: number; // 1-5 scale, default 3
}

const Reader: React.FC<ReaderProps> = ({ word, font, bionicMode = false, fontSize = 3 }) => {
  const getFontFamily = () => {
    switch (font) {
      case 'serif': return '"Merriweather", "Georgia", serif';
      case 'mono': return '"Fira Code", "Courier New", monospace';
      default: return '"Inter", system-ui, sans-serif';
    }
  };

  // Font size mapping: 1=small, 2=medium-small, 3=medium (default), 4=large, 5=extra-large
  const getFontSizeStyle = () => {
    const sizes = {
      1: 'clamp(2rem, 8vw, 4rem)',
      2: 'clamp(2.5rem, 12vw, 6rem)',
      3: 'clamp(3rem, 15vw, 8rem)',
      4: 'clamp(4rem, 18vw, 10rem)',
      5: 'clamp(5rem, 22vw, 12rem)'
    };
    return sizes[fontSize as keyof typeof sizes] || sizes[3];
  };

  const bionicSegments = React.useMemo(() => {
    if (!bionicMode) return null;

    // Only process a limited length to prevent stalling if "word" is huge (edge case)
    const textToProcess = word.length > 500 ? word.slice(0, 500) : word;

    return textToProcess.split(' ').map((w, i) => {
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
  }, [word, bionicMode]);

  return (
    <div className="reader-display">
      <div
        className="word-container"
        style={{ fontFamily: getFontFamily(), fontSize: getFontSizeStyle() }}
      >
        {bionicMode ? bionicSegments : word}
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
          /* Responsive font size: minimum 3rem, preferred 15vw, max 8rem */
          font-size: clamp(3rem, 15vw, 8rem);
          font-weight: 500;
          text-align: center;
          line-height: 1.2;
          z-index: 2;
          padding: 1rem;
          /* Ensure text handles wrapping if chunk size is large */
          max-width: 100%;
          word-break: break-word;
          transition: font-size 0.2s ease;
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
            .reader-display {
                min-height: 250px;
            }
        }
      `}</style>
    </div>
  );
};

export default Reader;
