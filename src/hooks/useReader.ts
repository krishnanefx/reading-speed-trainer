import { useState, useEffect, useCallback } from 'react';
import { ReaderEngine } from '../reader/ReaderEngine';
import { tokenizeText } from '../utils/tokenize';

interface UseReaderProps {
    text: string;
    wpm: number;
    chunkSize?: number;
}

export const useReader = ({ text, wpm, chunkSize = 1 }: UseReaderProps) => {
    const [engine] = useState(() => new ReaderEngine({ text: '', wpm, chunkSize }));
    const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());

    useEffect(() => {
        return engine.subscribe(setSnapshot);
    }, [engine]);

    const togglePlay = useCallback(() => {
        engine.togglePlay();
    }, [engine]);

    const reset = useCallback(() => {
        engine.reset();
    }, [engine]);

    const seek = useCallback((index: number) => {
        engine.seek(index);
    }, [engine]);

    const setIsPlaying = useCallback((isPlaying: boolean) => {
        engine.setPlaying(isPlaying);
    }, [engine]);

    useEffect(() => {
        let cancelled = false;
        const updateWords = async () => {
            const words = await tokenizeText(text);
            if (cancelled) return;
            engine.setWords(words);
        };
        void updateWords();
        return () => {
            cancelled = true;
        };
    }, [engine, text]);

    useEffect(() => {
        engine.setWpm(wpm);
    }, [engine, wpm]);

    useEffect(() => {
        engine.setChunkSize(chunkSize);
    }, [engine, chunkSize]);

    useEffect(() => {
        return () => {
            engine.destroy();
        };
    }, [engine]);

    return {
        words: snapshot.words,
        currentIndex: snapshot.currentIndex,
        isPlaying: snapshot.isPlaying,
        currentDisplay: snapshot.currentDisplay,
        togglePlay,
        reset,
        seek,
        setIsPlaying
    };
};
