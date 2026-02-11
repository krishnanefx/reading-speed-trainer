import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface UseReaderProps {
    text: string;
    wpm: number;
    chunkSize?: number;
}

export const useReader = ({ text, wpm, chunkSize = 1 }: UseReaderProps) => {
    const words = useMemo(() => text.split(/\s+/).filter(w => w.length > 0), [text]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const timerRef = useRef<number | null>(null);
    const sessionStartRef = useRef<number | null>(null);
    const logicalIndexRef = useRef(0);

    const togglePlay = useCallback(() => {
        if (words.length === 0) return;
        setIsPlaying(prev => !prev);
    }, [words.length]);

    const reset = useCallback(() => {
        setCurrentIndex(0);
        setIsPlaying(false);
    }, []);

    const seek = useCallback((index: number) => {
        setCurrentIndex(index);
    }, []);

    useEffect(() => {
        if (!isPlaying) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = null;
            sessionStartRef.current = null;
            return;
        }

        if (words.length === 0) return;

        if (sessionStartRef.current === null) {
            sessionStartRef.current = performance.now();
            logicalIndexRef.current = currentIndex;
        }

        const tick = () => {
            const start = sessionStartRef.current;
            if (start === null) return;
            const elapsedMs = performance.now() - start;
            const chunksPerMs = wpm / 60000 / chunkSize;
            const baselineChunksElapsed = Math.floor(elapsedMs * chunksPerMs);
            const targetIndex = baselineChunksElapsed * chunkSize + logicalIndexRef.current;

            const safeIndex = Math.min(targetIndex, Math.max(0, words.length - 1));
            setCurrentIndex((prev) => (safeIndex > prev ? safeIndex : prev));

            if (safeIndex >= words.length - 1) {
                setIsPlaying(false);
                return;
            }

            const currentChunkStr = words.slice(safeIndex, safeIndex + chunkSize).join(' ');
            const lastChar = currentChunkStr.slice(-1);
            let factor = 1.0;
            if (['.', '!', '?'].includes(lastChar)) factor = 1.8;
            else if ([',', ';', ':'].includes(lastChar)) factor = 1.4;
            else if (currentChunkStr.length > 12) factor = 1.15;

            const baseDelay = (60 / wpm) * 1000 * chunkSize;
            timerRef.current = window.setTimeout(tick, Math.max(8, Math.round(baseDelay * factor)));
        };

        timerRef.current = window.setTimeout(tick, 0);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isPlaying, words, wpm, chunkSize, currentIndex]);

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
