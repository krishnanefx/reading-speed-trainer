export interface Book {
    id: string;
    title: string;
    content: string;
    progress: number;
    totalWords: number;
    cover?: string;
    text?: string;
    currentIndex?: number;
    lastRead?: number;
    wpm?: number;
}

export interface LibraryBook {
    id: string;
    title: string;
    progress: number;
    totalWords: number;
    hasCover?: boolean;
    currentIndex?: number;
    lastRead?: number;
    wpm?: number;
}

export interface Session {
    id: string;
    bookId: string;
    timestamp: number;
    durationSeconds: number;
    wordsRead: number;
    averageWpm: number;
}

export interface UserProgress {
    id: string;
    currentStreak: number;
    longestStreak: number;
    totalWordsRead: number;
    peakWpm: number;
    dailyGoal: number;
    dailyGoalMetCount: number;
    unlockedAchievements: string[];
    lastReadDate: string;
    gymBestTime: number | null;
    defaultWpm?: number;
    defaultChunkSize?: number;
    defaultFont?: string;
    theme?: string;
    autoAccelerate?: boolean;
    bionicMode?: boolean;
}

export type SyncPayload = UserProgress | Session | Book | string;

export interface SyncItem {
    id?: number;
    type: 'UPDATE_PROGRESS' | 'SYNC_SESSION' | 'SYNC_BOOK' | 'DELETE_BOOK';
    payload: SyncPayload;
    key?: string;
    retryAttempts?: number;
    nextRetryAt?: number | null;
    lastError?: string | null;
    timestamp: number;
}

export type SyncPhase = 'idle' | 'syncing' | 'failed';

export interface SyncStatus {
    phase: SyncPhase;
    queueSize: number;
    retryAttempts: number;
    nextRetryAt: number | null;
    lastSyncedAt: number | null;
    lastError: string | null;
}

export const DEFAULT_PROGRESS: UserProgress = {
    id: 'default',
    currentStreak: 0,
    longestStreak: 0,
    totalWordsRead: 0,
    peakWpm: 0,
    dailyGoal: 5000,
    dailyGoalMetCount: 0,
    unlockedAchievements: [],
    lastReadDate: '',
    gymBestTime: null
};

export const toSafeNumber = (
    value: unknown,
    fallback: number,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY
) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
};

export const computeChecksum = (value: unknown): string => {
    const input = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const normalizeBackupPayload = (raw: unknown, maxImportItems: number) => {
    if (!isRecord(raw)) throw new Error('Invalid backup: expected object.');
    const version = toSafeNumber(raw.version, 0, 0);

    let progress: unknown;
    let sessions: unknown;
    let books: unknown;

    if (version === 1) {
        progress = raw.progress;
        sessions = raw.sessions;
        books = raw.books;
    } else if (version === 2) {
        const payload = raw.payload;
        if (!isRecord(payload)) throw new Error('Invalid backup payload.');
        const checksum = typeof raw.checksum === 'string' ? raw.checksum : '';
        const computed = computeChecksum(payload);
        if (!checksum || checksum !== computed) {
            throw new Error('Backup checksum mismatch.');
        }
        progress = payload.progress;
        sessions = payload.sessions;
        books = payload.books;
    } else {
        throw new Error('Unsupported backup version.');
    }

    if (!isRecord(progress) || !Array.isArray(sessions) || !Array.isArray(books)) {
        throw new Error('Invalid backup payload shape.');
    }

    const hasValidSessions = sessions.every((item) => isRecord(item));
    const hasValidBooks = books.every((item) => isRecord(item));
    if (!hasValidSessions || !hasValidBooks) {
        throw new Error('Invalid backup item records.');
    }

    if (sessions.length > maxImportItems || books.length > maxImportItems) {
        throw new Error('Backup contains too many records.');
    }

    return {
        progress: progress as Partial<UserProgress>,
        sessions,
        books,
    };
};

export const sanitizeBook = (book: Partial<Book>): Book => {
    const id = typeof book.id === 'string' && book.id.trim() ? book.id : crypto.randomUUID();
    const content = String(book.content ?? book.text ?? '');
    const totalWords = content.trim() ? content.trim().split(/\s+/).length : 0;
    return {
        id,
        title: String(book.title ?? 'Untitled'),
        content,
        progress: toSafeNumber(book.progress, 0, 0, 1),
        totalWords: toSafeNumber(book.totalWords, totalWords, 0),
        cover: typeof book.cover === 'string' ? book.cover : undefined,
        currentIndex: toSafeNumber(book.currentIndex, 0, 0),
        lastRead: toSafeNumber(book.lastRead, Date.now(), 0),
        wpm: toSafeNumber(book.wpm, 300, 60, 2000),
    };
};

export const toLibraryBook = (book: Partial<Book>): LibraryBook => ({
    id: String(book.id),
    title: String(book.title ?? 'Untitled'),
    progress: toSafeNumber(book.progress, 0, 0, 1),
    totalWords: toSafeNumber(book.totalWords, Math.max(0, Math.round(String(book.content || book.text || '').length / 5)), 0),
    hasCover: typeof book.cover === 'string' && book.cover.length > 0,
    currentIndex: toSafeNumber(book.currentIndex, 0, 0),
    lastRead: toSafeNumber(book.lastRead, 0, 0),
    wpm: toSafeNumber(book.wpm, 300, 60, 2000),
});

export const sanitizeSession = (session: Partial<Session>): Session => ({
    id: typeof session.id === 'string' && session.id.trim() ? session.id : crypto.randomUUID(),
    bookId: String(session.bookId ?? ''),
    timestamp: toSafeNumber(session.timestamp, Date.now(), 0),
    durationSeconds: toSafeNumber(session.durationSeconds, 0, 0),
    wordsRead: toSafeNumber(session.wordsRead, 0, 0),
    averageWpm: toSafeNumber(session.averageWpm, 0, 0, 3000),
});

export const toDateKey = (value: string | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

export const mergeProgress = (local: UserProgress, cloud: UserProgress): UserProgress => {
    const localDate = toDateKey(local.lastReadDate);
    const cloudDate = toDateKey(cloud.lastReadDate);
    const localDateValue = localDate ? Date.parse(`${localDate}T00:00:00.000Z`) : 0;
    const cloudDateValue = cloudDate ? Date.parse(`${cloudDate}T00:00:00.000Z`) : 0;
    const localIsNewer = localDateValue > cloudDateValue || local.totalWordsRead > cloud.totalWordsRead;

    return {
        ...cloud,
        ...local,
        id: 'default',
        currentStreak: Math.max(local.currentStreak, cloud.currentStreak),
        longestStreak: Math.max(local.longestStreak, cloud.longestStreak),
        totalWordsRead: Math.max(local.totalWordsRead, cloud.totalWordsRead),
        peakWpm: Math.max(local.peakWpm, cloud.peakWpm),
        dailyGoalMetCount: Math.max(local.dailyGoalMetCount, cloud.dailyGoalMetCount),
        unlockedAchievements: Array.from(new Set([...(cloud.unlockedAchievements || []), ...(local.unlockedAchievements || [])])),
        lastReadDate: localIsNewer ? (localDate || cloudDate) : (cloudDate || localDate),
        dailyGoal: local.dailyGoal || cloud.dailyGoal,
        gymBestTime: local.gymBestTime ?? cloud.gymBestTime ?? null,
        defaultWpm: local.defaultWpm ?? cloud.defaultWpm,
        defaultChunkSize: local.defaultChunkSize ?? cloud.defaultChunkSize,
        defaultFont: local.defaultFont ?? cloud.defaultFont,
        theme: local.theme ?? cloud.theme,
        autoAccelerate: local.autoAccelerate ?? cloud.autoAccelerate,
        bionicMode: local.bionicMode ?? cloud.bionicMode,
    };
};

export const resolveBookConflict = (local: Book, cloud: Book): { winner: 'local' | 'cloud'; book: Book } => {
    const localTs = local.lastRead || 0;
    const cloudTs = cloud.lastRead || 0;
    if (localTs > cloudTs) return { winner: 'local', book: local };
    if (cloudTs > localTs) return { winner: 'cloud', book: cloud };
    if ((local.progress || 0) >= (cloud.progress || 0)) return { winner: 'local', book: local };
    return { winner: 'cloud', book: cloud };
};

export const resolveSessionConflict = (
    local: Session,
    cloud: Session
): { winner: 'local' | 'cloud'; session: Session } => {
    const localTs = local.timestamp || 0;
    const cloudTs = cloud.timestamp || 0;
    if (localTs >= cloudTs) return { winner: 'local', session: local };
    return { winner: 'cloud', session: cloud };
};
