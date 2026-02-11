import React from 'react';
import './Reader.css';

interface ReaderProps {
  word: string;
  font: string;
  bionicMode?: boolean;
  fontSize?: number; // 1-5 scale, default 3
}

const Reader: React.FC<ReaderProps> = ({ word, font, bionicMode = false, fontSize = 3 }) => {
  const safeFontSize = Math.min(5, Math.max(1, fontSize));
  const fontClass = font === 'serif' ? 'font-serif' : font === 'mono' ? 'font-mono' : 'font-sans';

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
        <span key={i} className="bionic-segment">
          <b className="bionic-bold">{firstHalf}</b>
          <span className="bionic-tail">{secondHalf}</span>
        </span>
      );
    });
  }, [word, bionicMode]);

  return (
    <div className="reader-display">
      <div
        className={`word-container ${fontClass} size-${safeFontSize}`}
      >
        {bionicMode ? bionicSegments : word}
      </div>

      {/* Guiding Lines for visual focus */}
      <div className="guide-lines">
        <div className="guide-line top"></div>
        <div className="guide-line bottom"></div>
      </div>

    </div>
  );
};

export default Reader;
