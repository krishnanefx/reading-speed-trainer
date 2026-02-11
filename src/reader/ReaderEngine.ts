export interface ReaderSnapshot {
    words: string[];
    currentIndex: number;
    isPlaying: boolean;
    currentDisplay: string;
}

type SnapshotListener = (snapshot: ReaderSnapshot) => void;

interface ReaderEngineConfig {
    text: string;
    wpm: number;
    chunkSize: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class ReaderEngine {
    private words: string[] = [];
    private currentIndex = 0;
    private isPlaying = false;
    private wpm = 300;
    private chunkSize = 1;
    private timer: number | null = null;
    private sessionStart: number | null = null;
    private logicalStartIndex = 0;
    private listeners = new Set<SnapshotListener>();

    constructor(config: ReaderEngineConfig) {
        this.wpm = this.sanitizeWpm(config.wpm);
        this.chunkSize = this.sanitizeChunkSize(config.chunkSize);
        this.setText(config.text);
    }

    subscribe(listener: SnapshotListener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.listeners.delete(listener);
        };
    }

    destroy(): void {
        this.stopTimer();
        this.listeners.clear();
    }

    getSnapshot(): ReaderSnapshot {
        return {
            words: this.words,
            currentIndex: this.currentIndex,
            isPlaying: this.isPlaying,
            currentDisplay: this.words.slice(this.currentIndex, this.currentIndex + this.chunkSize).join(' ')
        };
    }

    setText(text: string): void {
        this.words = text.split(/\s+/).filter(w => w.length > 0);
        const maxIndex = Math.max(0, this.words.length - 1);
        this.currentIndex = clamp(this.currentIndex, 0, maxIndex);

        if (this.words.length === 0) {
            this.isPlaying = false;
            this.stopTimer();
            this.sessionStart = null;
        } else if (this.currentIndex >= this.words.length - 1) {
            this.isPlaying = false;
            this.stopTimer();
            this.sessionStart = null;
        }

        this.emit();
    }

    setWpm(wpm: number): void {
        this.wpm = this.sanitizeWpm(wpm);
        if (this.isPlaying) {
            this.scheduleNextTick(0);
        }
        this.emit();
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = this.sanitizeChunkSize(chunkSize);
        if (this.isPlaying) {
            this.scheduleNextTick(0);
        }
        this.emit();
    }

    togglePlay(): void {
        if (this.words.length === 0) return;
        this.setPlaying(!this.isPlaying);
    }

    setPlaying(nextPlaying: boolean): void {
        if (this.words.length === 0) {
            this.isPlaying = false;
            return;
        }

        const atEnd = this.currentIndex >= this.words.length - 1;
        const shouldPlay = nextPlaying && !atEnd;
        if (this.isPlaying === shouldPlay) return;

        this.isPlaying = shouldPlay;
        if (shouldPlay) {
            this.sessionStart = null;
            this.scheduleNextTick(0);
        } else {
            this.sessionStart = null;
            this.stopTimer();
        }
        this.emit();
    }

    reset(): void {
        this.currentIndex = 0;
        this.setPlaying(false);
        this.emit();
    }

    seek(index: number): void {
        if (this.words.length === 0) {
            this.currentIndex = 0;
            this.emit();
            return;
        }

        const nextIndex = clamp(index, 0, this.words.length - 1);
        if (this.currentIndex === nextIndex) return;

        this.currentIndex = nextIndex;
        if (this.isPlaying) {
            this.sessionStart = performance.now();
            this.logicalStartIndex = this.currentIndex;
            this.scheduleNextTick(0);
        }
        this.emit();
    }

    private sanitizeWpm(wpm: number): number {
        if (!Number.isFinite(wpm)) return 300;
        return clamp(Math.round(wpm), 60, 2000);
    }

    private sanitizeChunkSize(chunkSize: number): number {
        if (!Number.isFinite(chunkSize)) return 1;
        return clamp(Math.round(chunkSize), 1, 10);
    }

    private emit(): void {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }

    private stopTimer(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private scheduleNextTick(delayMs: number): void {
        this.stopTimer();
        this.timer = window.setTimeout(() => this.tick(), Math.max(0, Math.round(delayMs)));
    }

    private tick(): void {
        if (!this.isPlaying || this.words.length === 0) return;

        if (this.sessionStart === null) {
            this.sessionStart = performance.now();
            this.logicalStartIndex = this.currentIndex;
        }

        const elapsedMs = performance.now() - this.sessionStart;
        const chunksPerMs = this.wpm / 60000 / this.chunkSize;
        const baselineChunksElapsed = Math.floor(elapsedMs * chunksPerMs);
        const targetIndex = baselineChunksElapsed * this.chunkSize + this.logicalStartIndex;

        const safeIndex = Math.min(targetIndex, Math.max(0, this.words.length - 1));
        if (safeIndex > this.currentIndex) {
            this.currentIndex = safeIndex;
            this.emit();
        }

        if (safeIndex >= this.words.length - 1) {
            this.setPlaying(false);
            return;
        }

        const currentChunk = this.words.slice(safeIndex, safeIndex + this.chunkSize).join(' ');
        const lastChar = currentChunk.slice(-1);
        let factor = 1.0;
        if (['.', '!', '?'].includes(lastChar)) factor = 1.8;
        else if ([',', ';', ':'].includes(lastChar)) factor = 1.4;
        else if (currentChunk.length > 12) factor = 1.15;

        const baseDelay = (60 / this.wpm) * 1000 * this.chunkSize;
        this.scheduleNextTick(Math.max(8, baseDelay * factor));
    }
}
