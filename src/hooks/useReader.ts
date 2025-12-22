import { useState, useEffect, useRef, useCallback } from 'react';

interface UseReaderProps {
    text: string;
    wpm: number;
    chunkSize?: number;
}

export const useReader = ({ text, wpm, chunkSize = 1 }: UseReaderProps) => {
    const [words, setWords] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        // Process text into words
        // Basic splitting.
        const splitWords = text.split(/\s+/).filter(w => w.length > 0);
        setWords(splitWords);
        setCurrentIndex(0);
        setIsPlaying(false);
    }, [text]);

    const togglePlay = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    const reset = useCallback(() => {
        setCurrentIndex(0);
        setIsPlaying(false);
    }, []);

    const seek = useCallback((index: number) => {
        setCurrentIndex(index);
    }, []);

    const scheduleNextWord = useCallback(() => {
        // Calculate base delay per chunk
        // 60 seconds / wpm = seconds per word
        // * 1000 = ms per word
        // * chunkSize = ms per chunk
        const baseDelay = (60 / wpm) * 1000 * chunkSize;

        // Look at the current chunk to decide delay for *this* chunk
        // (i.e., how long we stay on the current words before moving to the next)
        let factor = 1.0;

        if (currentIndex < words.length) {
            const currentChunkStr = words.slice(currentIndex, currentIndex + chunkSize).join(' ');
            const lastChar = currentChunkStr.slice(-1);

            if (['.', '!', '?'].includes(lastChar)) {
                factor = 2.0; // Pause longer at sentence end
            } else if ([',', ';', ':'].includes(lastChar)) {
                factor = 1.5; // Pause slightly at clauses
            } else if (currentChunkStr.length > 12) {
                factor = 1.2; // Slight delay for long words
            }
        }

        const delay = baseDelay * factor;

        timerRef.current = window.setTimeout(() => {
            setCurrentIndex(prev => {
                const next = prev + chunkSize;
                if (next >= words.length) {
                    setIsPlaying(false);
                    return words.length - 1;
                }
                return next;
            });
        }, delay);

    }, [currentIndex, words, wpm, chunkSize]);

    useEffect(() => {
        if (isPlaying) {
            scheduleNextWord();
        } else {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [isPlaying, currentIndex, scheduleNextWord]);

    // Compute displayed text
    const currentDisplay = words.slice(currentIndex, currentIndex + chunkSize).join(' ');

    return {
        words,
        currentIndex,
        isPlaying,
        currentDisplay,
        togglePlay,
        reset,
        seek,
        setIsPlaying
    };
};
