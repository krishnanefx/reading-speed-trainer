import { openDB } from 'idb';
import { isCloudSyncEnabled, supabase } from '../lib/supabase';
import { devError } from './logger';

const DB_NAME = 'ReadingTrainerDB';
const BOOKS_STORE = 'books';
const BOOK_META_STORE = 'book_meta';
const BOOK_COVER_STORE = 'book_covers';
const SESSIONS_STORE = 'sessions';
const STORE_NAME = 'progress';
const SYNC_QUEUE_STORE = 'sync_queue';
const DB_VERSION = 5; // Incremented for dedicated cover store and lazy library cover loading
const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMPORT_ITEMS = 50_000;
const MAX_SYNC_RETRY_ATTEMPTS = 6;
const BASE_SYNC_RETRY_MS = 5_000;

export interface Book {
    id: string;
    title: string;
    content: string;
    progress: number;
    totalWords: number;
    cover?: string; // Base64 image string
    // Legacy fields
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
    id: string; // 'default'
    currentStreak: number;
    longestStreak: number;
    totalWordsRead: number;
    peakWpm: number;
    dailyGoal: number;
    dailyGoalMetCount: number;
    unlockedAchievements: string[];
    lastReadDate: string; // ISO Date string YYYY-MM-DD
    gymBestTime: number | null;
    // Settings
    defaultWpm?: number;
    defaultChunkSize?: number;
    defaultFont?: string;
    theme?: string;
    autoAccelerate?: boolean;
    bionicMode?: boolean;
}


type SyncPayload = UserProgress | Session | Book | string;

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

const isCloudAvailable = () => Boolean(isCloudSyncEnabled && supabase);

let syncStatus: SyncStatus = {
    phase: 'idle',
    queueSize: 0,
    retryAttempts: 0,
    nextRetryAt: null,
    lastSyncedAt: null,
    lastError: null,
};
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const syncListeners = new Set<(status: SyncStatus) => void>();

const emitSyncStatus = () => {
    for (const listener of syncListeners) listener(syncStatus);
};

const updateSyncStatus = (updates: Partial<SyncStatus>) => {
    syncStatus = { ...syncStatus, ...updates };
    emitSyncStatus();
};

const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim().length > 0) return error;
    return 'Sync failed';
};

const getSyncRetryDelayMs = (attempt: number): number => {
    return Math.min(BASE_SYNC_RETRY_MS * (2 ** Math.max(0, attempt - 1)), 60_000);
};

const getSyncItemKey = (type: SyncItem['type'], payload: SyncPayload): string => {
    if (type === 'UPDATE_PROGRESS') return 'UPDATE_PROGRESS:default';
    if (type === 'SYNC_BOOK') return `SYNC_BOOK:${(payload as Book).id}`;
    if (type === 'DELETE_BOOK') return `DELETE_BOOK:${payload as string}`;
    return `SYNC_SESSION:${(payload as Session).id}`;
};

const normalizeSyncItem = (item: SyncItem): SyncItem => {
    const retryAttempts = toSafeNumber(item.retryAttempts, 0, 0, 1000);
    const rawNextRetryAt = item.nextRetryAt;
    const nextRetryAt = typeof rawNextRetryAt === 'number' && Number.isFinite(rawNextRetryAt) ? rawNextRetryAt : null;
    const lastError = typeof item.lastError === 'string' ? item.lastError : null;

    return {
        ...item,
        key: item.key || getSyncItemKey(item.type, item.payload),
        retryAttempts,
        nextRetryAt,
        lastError,
    };
};

const computeQueueStatus = (queue: SyncItem[]) => {
    const retryAttempts = queue.reduce((maxAttempts, item) => {
        return Math.max(maxAttempts, toSafeNumber(item.retryAttempts, 0, 0, 1000));
    }, 0);

    const nextRetryAt = queue.reduce<number | null>((next, item) => {
        const candidate = typeof item.nextRetryAt === 'number' && Number.isFinite(item.nextRetryAt) ? item.nextRetryAt : null;
        if (candidate === null) return next;
        if (next === null || candidate < next) return candidate;
        return next;
    }, null);

    const lastError = queue.reduce<string | null>((latest, item) => {
        if (typeof item.lastError === 'string' && item.lastError.length > 0) return item.lastError;
        return latest;
    }, null);

    return { retryAttempts, nextRetryAt, lastError };
};

const syncQueueRetryTimer = () => retryTimer;

const scheduleNextQueueRetry = (nextRetryAt: number | null) => {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }

    if (nextRetryAt === null || nextRetryAt <= Date.now()) {
        return;
    }

    const delay = Math.max(100, nextRetryAt - Date.now());
    retryTimer = setTimeout(async () => {
        retryTimer = null;
        await processSyncQueue();
    }, delay);
};

const scheduleSyncRetry = (reason: unknown) => {
    if (syncQueueRetryTimer() || syncStatus.retryAttempts >= MAX_SYNC_RETRY_ATTEMPTS) {
        updateSyncStatus({ phase: 'failed', lastError: normalizeErrorMessage(reason), nextRetryAt: null });
        return;
    }

    const nextAttempts = syncStatus.retryAttempts + 1;
    const delay = Math.min(BASE_SYNC_RETRY_MS * (2 ** (nextAttempts - 1)), 60_000);
    const nextRetryAt = Date.now() + delay;
    updateSyncStatus({
        phase: 'failed',
        retryAttempts: nextAttempts,
        nextRetryAt,
        lastError: normalizeErrorMessage(reason),
    });

    retryTimer = setTimeout(async () => {
        retryTimer = null;
        await processSyncQueue();
    }, delay);
};

export const getSyncStatus = (): SyncStatus => syncStatus;

export const subscribeSyncStatus = (listener: (status: SyncStatus) => void) => {
    syncListeners.add(listener);
    listener(syncStatus);
    return () => {
        syncListeners.delete(listener);
    };
};

const getSessionUserId = async (): Promise<string | null> => {
    if (!isCloudAvailable()) return null;
    const { data: { session } } = await supabase!.auth.getSession();
    return session?.user?.id ?? null;
};

const dedupeSyncQueue = (items: SyncItem[]): SyncItem[] => {
    const ordered = items.map(normalizeSyncItem).sort((a, b) => {
        const aId = typeof a.id === 'number' ? a.id : 0;
        const bId = typeof b.id === 'number' ? b.id : 0;
        return a.timestamp - b.timestamp || aId - bId;
    });

    const byKey = new Map<string, SyncItem>();
    for (const item of ordered) {
        byKey.set(item.key || getSyncItemKey(item.type, item.payload), item);
    }

    return [...byKey.values()].sort((a, b) => {
        const aId = typeof a.id === 'number' ? a.id : 0;
        const bId = typeof b.id === 'number' ? b.id : 0;
        return a.timestamp - b.timestamp || aId - bId;
    });
};

const compactSyncQueue = async () => {
    const db = await initDB();
    const deduped = dedupeSyncQueue((await db.getAll(SYNC_QUEUE_STORE)) as SyncItem[]);
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    await tx.store.clear();
    for (const item of deduped) {
        const persisted = { ...item };
        delete persisted.id;
        await tx.store.put(persisted);
    }
    await tx.done;
};

const updateSyncStatusFromQueue = async () => {
    const db = await initDB();
    const queue = dedupeSyncQueue((await db.getAll(SYNC_QUEUE_STORE)) as SyncItem[]);
    const queueSize = queue.length;
    if (queueSize === 0) {
        updateSyncStatus({
            queueSize: 0,
            retryAttempts: 0,
            nextRetryAt: null,
            lastError: null,
            phase: syncStatus.phase === 'syncing' ? 'syncing' : 'idle',
        });
        scheduleNextQueueRetry(null);
        return;
    }

    const { retryAttempts, nextRetryAt, lastError } = computeQueueStatus(queue);
    updateSyncStatus({
        queueSize,
        retryAttempts,
        nextRetryAt,
        lastError,
        phase: retryAttempts > 0 ? 'failed' : (syncStatus.phase === 'syncing' ? 'syncing' : 'idle'),
    });
    scheduleNextQueueRetry(nextRetryAt);
};

const toSafeNumber = (value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) => {
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

const computeChecksum = (value: unknown): string => {
    const input = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeBackupPayload = (raw: unknown) => {
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

    if (sessions.length > MAX_IMPORT_ITEMS || books.length > MAX_IMPORT_ITEMS) {
        throw new Error('Backup contains too many records.');
    }

    return {
        progress: progress as Partial<UserProgress>,
        sessions,
        books,
    };
};

const sanitizeBook = (book: Partial<Book>): Book => {
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

const toLibraryBook = (book: Partial<Book>): LibraryBook => ({
    id: String(book.id),
    title: String(book.title ?? 'Untitled'),
    progress: toSafeNumber(book.progress, 0, 0, 1),
    totalWords: toSafeNumber(book.totalWords, Math.max(0, Math.round(String(book.content || book.text || '').length / 5)), 0),
    hasCover: typeof book.cover === 'string' && book.cover.length > 0,
    currentIndex: toSafeNumber(book.currentIndex, 0, 0),
    lastRead: toSafeNumber(book.lastRead, 0, 0),
    wpm: toSafeNumber(book.wpm, 300, 60, 2000),
});

const sanitizeSession = (session: Partial<Session>): Session => ({
    id: typeof session.id === 'string' && session.id.trim() ? session.id : crypto.randomUUID(),
    bookId: String(session.bookId ?? ''),
    timestamp: toSafeNumber(session.timestamp, Date.now(), 0),
    durationSeconds: toSafeNumber(session.durationSeconds, 0, 0),
    wordsRead: toSafeNumber(session.wordsRead, 0, 0),
    averageWpm: toSafeNumber(session.averageWpm, 0, 0, 3000),
});

const toDateKey = (value: string | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

const mergeProgress = (local: UserProgress, cloud: UserProgress): UserProgress => {
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

const resolveBookConflict = (local: Book, cloud: Book): { winner: 'local' | 'cloud'; book: Book } => {
    const localTs = local.lastRead || 0;
    const cloudTs = cloud.lastRead || 0;
    if (localTs > cloudTs) return { winner: 'local', book: local };
    if (cloudTs > localTs) return { winner: 'cloud', book: cloud };
    if ((local.progress || 0) >= (cloud.progress || 0)) return { winner: 'local', book: local };
    return { winner: 'cloud', book: cloud };
};

const resolveSessionConflict = (
    local: Session,
    cloud: Session
): { winner: 'local' | 'cloud'; session: Session } => {
    const localTs = local.timestamp || 0;
    const cloudTs = cloud.timestamp || 0;
    if (localTs >= cloudTs) return { winner: 'local', session: local };
    return { winner: 'cloud', session: cloud };
};

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BOOKS_STORE)) {
                db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BOOK_META_STORE)) {
                db.createObjectStore(BOOK_META_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BOOK_COVER_STORE)) {
                db.createObjectStore(BOOK_COVER_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
                db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

// Queue Helper
export const addToSyncQueue = async (type: SyncItem['type'], payload: SyncPayload) => {
    const db = await initDB();
    const key = getSyncItemKey(type, payload);
    const all = dedupeSyncQueue((await db.getAll(SYNC_QUEUE_STORE)) as SyncItem[]);
    const existing = all.find((item) => item.key === key);

    await db.put(SYNC_QUEUE_STORE, {
        id: existing?.id,
        type,
        payload,
        key,
        timestamp: Date.now(),
        retryAttempts: 0,
        nextRetryAt: null,
        lastError: null,
    });

    await compactSyncQueue();
    await updateSyncStatusFromQueue();
};

// Cloud Sync Helpers with Queue Strategy
const syncProgressToCloud = async (progress: UserProgress, queueOnFailure = true): Promise<boolean> => {
    if (!isCloudAvailable()) return false;
    if (!navigator.onLine) {
        if (queueOnFailure) {
            await addToSyncQueue('UPDATE_PROGRESS', progress);
        }
        return false;
    }

    const userId = await getSessionUserId();
    if (!userId) return false;

    const { error } = await supabase!
        .from('user_progress')
        .upsert({
            user_id: userId,
            current_streak: progress.currentStreak,
            longest_streak: progress.longestStreak,
            total_words_read: progress.totalWordsRead,
            peak_wpm: progress.peakWpm,
            daily_goal: progress.dailyGoal,
            gym_best_time: progress.gymBestTime,
            unlocked_achievements: progress.unlockedAchievements,
            last_read_date: progress.lastReadDate
        });

    if (error) {
        devError('Cloud Sync Error (Progress):', error);
        if (queueOnFailure) {
            await addToSyncQueue('UPDATE_PROGRESS', progress);
        }
        return false;
    }

    return true;
};

const syncSessionToCloud = async (s: Session, queueOnFailure = true): Promise<boolean> => {
    if (!isCloudAvailable()) return false;
    if (!navigator.onLine) {
        if (queueOnFailure) {
            await addToSyncQueue('SYNC_SESSION', s);
        }
        return false;
    }

    const userId = await getSessionUserId();
    if (!userId) return false;

    const { error } = await supabase!
        .from('reading_sessions')
        .upsert({
            id: s.id,
            user_id: userId,
            book_id: s.bookId,
            duration_seconds: s.durationSeconds,
            words_read: s.wordsRead,
            average_wpm: s.averageWpm,
            timestamp: s.timestamp
        });

    if (error) {
        devError('Cloud Sync Error (Session):', error);
        if (queueOnFailure) {
            await addToSyncQueue('SYNC_SESSION', s);
        }
        return false;
    }

    return true;
};

const syncBookToCloud = async (book: Book, queueOnFailure = true): Promise<boolean> => {
    if (!isCloudAvailable()) return false;
    if (!navigator.onLine) {
        if (queueOnFailure) {
            await addToSyncQueue('SYNC_BOOK', book);
        }
        return false;
    }

    const userId = await getSessionUserId();
    if (!userId) return false;

    const { error } = await supabase!
        .from('books')
        .upsert({
            id: book.id,
            user_id: userId,
            title: book.title,
            content: book.content,
            progress: book.progress,
            total_words: book.totalWords,
            current_index: book.currentIndex || 0,
            last_read: book.lastRead || Date.now(),
            wpm: book.wpm,
            cover: book.cover
        });

    if (error) {
        devError('Cloud Sync Error (Book):', error);
        if (queueOnFailure) {
            await addToSyncQueue('SYNC_BOOK', book);
        }
        return false;
    }

    return true;
};

const deleteBookFromCloud = async (id: string, queueOnFailure = true): Promise<boolean> => {
    if (!isCloudAvailable()) return false;
    if (!navigator.onLine) {
        if (queueOnFailure) {
            await addToSyncQueue('DELETE_BOOK', id);
        }
        return false;
    }

    const userId = await getSessionUserId();
    if (!userId) return false;

    const { error } = await supabase!.from('books').delete().eq('id', id).eq('user_id', userId);
    if (error) {
        devError('Cloud Sync Error (Delete Book):', error);
        if (queueOnFailure) {
            await addToSyncQueue('DELETE_BOOK', id);
        }
        return false;
    }
    return true;
};

// Main Sync Function (Pull from Cloud)
export const syncFromCloud = async () => {
    if (!isCloudAvailable()) return false;
    const userId = await getSessionUserId();
    if (!userId) return false;
    updateSyncStatus({ phase: 'syncing', lastError: null, nextRetryAt: null });

    try {
        // 1. Get Progress
        const { data: cloudProgress, error: progressError } = await supabase!
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (progressError) {
            throw progressError;
        } else if (cloudProgress) {
            const localProgress = await getUserProgress();
            // Map back to local format
            const mappedCloudProgress: UserProgress = {
                id: 'default',
                currentStreak: cloudProgress.current_streak,
                longestStreak: cloudProgress.longest_streak,
                totalWordsRead: cloudProgress.total_words_read,
                peakWpm: cloudProgress.peak_wpm,
                dailyGoal: cloudProgress.daily_goal,
                gymBestTime: cloudProgress.gym_best_time,
                unlockedAchievements: cloudProgress.unlocked_achievements || [],
                lastReadDate: cloudProgress.last_read_date,
                dailyGoalMetCount: 0,
                defaultWpm: cloudProgress.default_wpm,
                defaultChunkSize: cloudProgress.default_chunk_size,
                defaultFont: cloudProgress.default_font,
                theme: cloudProgress.theme,
                autoAccelerate: cloudProgress.auto_accelerate,
                bionicMode: cloudProgress.bionic_mode
            };
            const merged = mergeProgress(localProgress, mappedCloudProgress);
            await updateUserProgress(merged, false);
            await syncProgressToCloud(merged, false);
        }

        // 2. Get Books
        const { data: cloudBooks, error: booksError } = await supabase!
            .from('books')
            .select('*')
            .eq('user_id', userId);

        if (booksError) {
            throw booksError;
        } else if (cloudBooks) {
            const db = await initDB();
            const localBooks = await getBooks();
            const localById = new Map(localBooks.map((book) => [book.id, book]));
            const tx = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');

            for (const cb of cloudBooks) {
                const localBook: Book = {
                    id: cb.id,
                    title: cb.title,
                    content: cb.content || '',
                    progress: cb.progress,
                    totalWords: cb.total_words,
                    currentIndex: cb.current_index,
                    lastRead: cb.last_read,
                    wpm: cb.wpm,
                    cover: cb.cover
                };
                const existing = localById.get(localBook.id);
                if (existing) {
                    const resolved = resolveBookConflict(existing, localBook);
                    await tx.objectStore(BOOKS_STORE).put(sanitizeBook(resolved.book));
                    await tx.objectStore(BOOK_META_STORE).put(toLibraryBook(resolved.book));
                    if (resolved.book.cover) {
                        await tx.objectStore(BOOK_COVER_STORE).put({ id: resolved.book.id, cover: resolved.book.cover });
                    } else {
                        await tx.objectStore(BOOK_COVER_STORE).delete(resolved.book.id);
                    }
                    if (resolved.winner === 'local') {
                        await syncBookToCloud(existing, false);
                    }
                } else {
                    const sanitized = sanitizeBook(localBook);
                    await tx.objectStore(BOOKS_STORE).put(sanitized);
                    await tx.objectStore(BOOK_META_STORE).put(toLibraryBook(sanitized));
                    if (sanitized.cover) {
                        await tx.objectStore(BOOK_COVER_STORE).put({ id: sanitized.id, cover: sanitized.cover });
                    } else {
                        await tx.objectStore(BOOK_COVER_STORE).delete(sanitized.id);
                    }
                }
            }

            const cloudIds = new Set(cloudBooks.map((book) => String(book.id)));
            for (const localBook of localBooks) {
                if (!cloudIds.has(localBook.id)) {
                    await syncBookToCloud(localBook, false);
                }
            }
            await tx.done;
        }

        // 3. Get Sessions (Fix for empty sessions table)
        const { data: cloudSessions, error: sessionsError } = await supabase!
            .from('reading_sessions')
            .select('*')
            .eq('user_id', userId);

        if (sessionsError) {
            throw sessionsError;
        } else if (cloudSessions) {
            const db = await initDB();
            const localSessions = await getSessions();
            const localById = new Map(localSessions.map((session) => [session.id, sanitizeSession(session)]));
            const cloudById = new Map<string, Session>();
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');

            for (const cs of cloudSessions) {
                const cloudSession = sanitizeSession({
                    id: cs.id,
                    bookId: cs.book_id,
                    durationSeconds: cs.duration_seconds,
                    wordsRead: cs.words_read,
                    averageWpm: cs.average_wpm,
                    timestamp: cs.timestamp
                });
                cloudById.set(cloudSession.id, cloudSession);
                const localSession = localById.get(cloudSession.id);
                if (!localSession) {
                    await tx.store.put(cloudSession);
                    continue;
                }

                const resolved = resolveSessionConflict(localSession, cloudSession);
                await tx.store.put(resolved.session);
                if (resolved.winner === 'local') {
                    await syncSessionToCloud(localSession, false);
                }
            }

            for (const localSession of localById.values()) {
                if (!cloudById.has(localSession.id)) {
                    await tx.store.put(localSession);
                    await syncSessionToCloud(localSession, false);
                }
            }
            await tx.done;
        }

        updateSyncStatus({
            phase: 'idle',
            retryAttempts: 0,
            nextRetryAt: null,
            lastError: null,
            lastSyncedAt: Date.now(),
        });
        return true;
    } catch (error) {
        scheduleSyncRetry(error);
        return false;
    }
};

export const processSyncQueue = async () => {
    if (!isCloudAvailable() || !navigator.onLine) {
        await updateSyncStatusFromQueue();
        updateSyncStatus({ phase: 'idle' });
        return;
    }

    const db = await initDB();
    await compactSyncQueue();
    const queue = dedupeSyncQueue((await db.getAll(SYNC_QUEUE_STORE)) as SyncItem[]);
    if (queue.length === 0) {
        updateSyncStatus({
            phase: 'idle',
            queueSize: 0,
            retryAttempts: 0,
            nextRetryAt: null,
            lastError: null,
            lastSyncedAt: Date.now(),
        });
        return;
    }
    updateSyncStatus({ phase: 'syncing', queueSize: queue.length, nextRetryAt: null });

    let failedCount = 0;
    const now = Date.now();
    for (const item of queue) {
        const normalized = normalizeSyncItem(item);
        if (normalized.nextRetryAt && normalized.nextRetryAt > now) {
            continue;
        }

        let success = false;
        let hadError = false;
        try {
            if (normalized.type === 'UPDATE_PROGRESS') {
                success = await syncProgressToCloud(normalized.payload as UserProgress, false);
            } else if (normalized.type === 'SYNC_SESSION') {
                success = await syncSessionToCloud(normalized.payload as Session, false);
            } else if (normalized.type === 'SYNC_BOOK') {
                success = await syncBookToCloud(normalized.payload as Book, false);
            } else if (normalized.type === 'DELETE_BOOK') {
                success = await deleteBookFromCloud(normalized.payload as string, false);
            }
        } catch (e) {
            hadError = true;
            failedCount += 1;
            const attempt = toSafeNumber(normalized.retryAttempts, 0, 0, 1000) + 1;
            const maxed = attempt >= MAX_SYNC_RETRY_ATTEMPTS;
            const nextRetryAt = maxed ? null : Date.now() + getSyncRetryDelayMs(attempt);
            await db.put(SYNC_QUEUE_STORE, {
                ...normalized,
                retryAttempts: attempt,
                nextRetryAt,
                lastError: normalizeErrorMessage(e),
                timestamp: Date.now(),
            });
        }

        if (success) {
            if (normalized.id) await db.delete(SYNC_QUEUE_STORE, normalized.id);
        } else if (!hadError) {
            failedCount += 1;
            const attempt = toSafeNumber(normalized.retryAttempts, 0, 0, 1000) + 1;
            const maxed = attempt >= MAX_SYNC_RETRY_ATTEMPTS;
            const nextRetryAt = maxed ? null : Date.now() + getSyncRetryDelayMs(attempt);
            await db.put(SYNC_QUEUE_STORE, {
                ...normalized,
                retryAttempts: attempt,
                nextRetryAt,
                lastError: normalizeErrorMessage('Sync operation returned without success.'),
                timestamp: Date.now(),
            });
        }
    }

    await compactSyncQueue();
    const remainingQueue = dedupeSyncQueue((await db.getAll(SYNC_QUEUE_STORE)) as SyncItem[]);
    const remaining = remainingQueue.length;
    if (failedCount === 0 && remaining === 0) {
        updateSyncStatus({
            phase: 'idle',
            queueSize: 0,
            retryAttempts: 0,
            nextRetryAt: null,
            lastError: null,
            lastSyncedAt: Date.now(),
        });
        return;
    }
    const { retryAttempts, nextRetryAt, lastError } = computeQueueStatus(remainingQueue);
    updateSyncStatus({
        phase: retryAttempts > 0 ? 'failed' : 'idle',
        queueSize: remaining,
        retryAttempts,
        nextRetryAt,
        lastError: lastError || (remaining > 0 ? `Queued items remaining: ${remaining}` : null),
    });
    scheduleNextQueueRetry(nextRetryAt);
};

export const saveBook = async (book: Book) => {
    const db = await initDB();
    const val = sanitizeBook(book);
    const tx = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');
    await tx.objectStore(BOOKS_STORE).put(val);
    await tx.objectStore(BOOK_META_STORE).put(toLibraryBook(val));
    if (val.cover) {
        await tx.objectStore(BOOK_COVER_STORE).put({ id: val.id, cover: val.cover });
    } else {
        await tx.objectStore(BOOK_COVER_STORE).delete(val.id);
    }
    await tx.done;
    await syncBookToCloud(val);
};

export const getBooks = async (): Promise<Book[]> => {
    const db = await initDB();
    const books = await db.getAll(BOOKS_STORE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return books.map((b: any) => ({
        ...b,
        content: b.content || b.text || '',
        totalWords: toSafeNumber(b.totalWords, Math.max(0, Math.round(String(b.content || b.text || '').length / 5)), 0)
    }));
};

export const getLibraryBooks = async (): Promise<LibraryBook[]> => {
    const db = await initDB();
    const meta = await db.getAll(BOOK_META_STORE);
    return meta.map((m) => {
        const item = m as LibraryBook & { cover?: string };
        return {
            ...item,
            hasCover: item.hasCover ?? Boolean(item.cover),
        };
    });
};

export const getLibraryBookCovers = async (bookIds: string[]): Promise<Record<string, string>> => {
    const ids = Array.from(new Set(bookIds)).filter(Boolean);
    if (ids.length === 0) return {};
    const db = await initDB();
    const entries = await Promise.all(ids.map((id) => db.get(BOOK_COVER_STORE, id)));
    const result: Record<string, string> = {};
    for (const entry of entries) {
        if (entry?.id && typeof entry.cover === 'string') {
            result[String(entry.id)] = entry.cover;
        }
    }
    return result;
};

export const getBookCount = async (): Promise<number> => {
    const db = await initDB();
    return db.count(BOOKS_STORE);
};

export const rebuildLibraryBookIndex = async () => {
    const db = await initDB();
    const tx = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');
    const books = await tx.objectStore(BOOKS_STORE).getAll();
    await tx.objectStore(BOOK_META_STORE).clear();
    await tx.objectStore(BOOK_COVER_STORE).clear();
    for (const book of books) {
        const typedBook = book as Partial<Book>;
        await tx.objectStore(BOOK_META_STORE).put(toLibraryBook(typedBook));
        if (typedBook.cover) {
            await tx.objectStore(BOOK_COVER_STORE).put({ id: String(typedBook.id), cover: typedBook.cover });
        }
    }
    await tx.done;
};

export const getBook = async (id: string): Promise<Book | undefined> => {
    const db = await initDB();
    const book = await db.get(BOOKS_STORE, id);
    if (book) {
        const coverEntry = await db.get(BOOK_COVER_STORE, id);
        return {
            ...book,
            cover: coverEntry?.cover || book.cover,
            content: book.content || book.text || ''
        }
    }
    return undefined;
};

export const updateBookProgress = async (
    id: string,
    progress: number,
    currentIndex?: number,
    wpm?: number,
    sync = true
) => {
    const db = await initDB();
    const book = await db.get(BOOKS_STORE, id);
    if (book) {
        book.progress = progress;
        if (currentIndex !== undefined) book.currentIndex = currentIndex;
        book.lastRead = Date.now();
        if (wpm) book.wpm = toSafeNumber(wpm, book.wpm || 300, 60, 2000);
        const tx = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');
        await tx.objectStore(BOOKS_STORE).put(book);
        await tx.objectStore(BOOK_META_STORE).put(toLibraryBook(book as Partial<Book>));
        if (book.cover) {
            await tx.objectStore(BOOK_COVER_STORE).put({ id: String(book.id), cover: book.cover });
        } else {
            await tx.objectStore(BOOK_COVER_STORE).delete(String(book.id));
        }
        await tx.done;
        if (sync) {
            await syncBookToCloud(sanitizeBook(book));
        }
    }
};

export const deleteBook = async (id: string) => {
    const db = await initDB();
    const tx = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');
    await tx.objectStore(BOOKS_STORE).delete(id);
    await tx.objectStore(BOOK_META_STORE).delete(id);
    await tx.objectStore(BOOK_COVER_STORE).delete(id);
    await tx.done;
    await deleteBookFromCloud(id);
};

export const logSession = async (session: Session) => {
    const db = await initDB();
    const safeSession = sanitizeSession(session);
    await db.put(SESSIONS_STORE, safeSession);
    await syncSessionToCloud(safeSession);
};

export const getSessions = async (): Promise<Session[]> => {
    const db = await initDB();
    return db.getAll(SESSIONS_STORE);
};

export const clearSessions = async () => {
    const db = await initDB();
    await db.clear(SESSIONS_STORE);
};

// Data Export/Import for Manual Sync
export const exportUserData = async (): Promise<string> => {
    const progress = await getUserProgress();
    const sessions = await getSessions();
    const books = await getBooks();

    const payload = {
        progress,
        sessions,
        books
    };
    const data = {
        version: 2,
        timestamp: Date.now(),
        payload,
        checksum: computeChecksum(payload)
    };
    return JSON.stringify(data);
};

export const importUserData = async (jsonString: string): Promise<boolean> => {
    try {
        if (jsonString.length > MAX_IMPORT_SIZE_BYTES) {
            throw new Error('Import file is too large.');
        }

        const parsed = JSON.parse(jsonString) as unknown;
        const { progress: progressUpdate, sessions, books } = normalizeBackupPayload(parsed);

        await updateUserProgress({
            ...DEFAULT_PROGRESS,
            ...progressUpdate,
            id: 'default',
            currentStreak: toSafeNumber(progressUpdate.currentStreak, 0, 0),
            longestStreak: toSafeNumber(progressUpdate.longestStreak, 0, 0),
            totalWordsRead: toSafeNumber(progressUpdate.totalWordsRead, 0, 0),
            peakWpm: toSafeNumber(progressUpdate.peakWpm, 0, 0),
            dailyGoal: toSafeNumber(progressUpdate.dailyGoal, 5000, 100, 500000),
            dailyGoalMetCount: toSafeNumber(progressUpdate.dailyGoalMetCount, 0, 0),
            unlockedAchievements: Array.isArray(progressUpdate.unlockedAchievements)
                ? progressUpdate.unlockedAchievements.filter((item): item is string => typeof item === 'string')
                : [],
            lastReadDate: toDateKey(progressUpdate.lastReadDate),
            gymBestTime: progressUpdate.gymBestTime ?? null,
        });

        const db = await initDB();

        // Import Sessions
        const txSession = db.transaction('sessions', 'readwrite');
        for (const s of sessions) {
            await txSession.store.put(sanitizeSession(s));
        }
        await txSession.done;

        // Import Books
        const txBooks = db.transaction([BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE], 'readwrite');
        for (const b of books) {
            const sanitized = sanitizeBook(b);
            await txBooks.objectStore(BOOKS_STORE).put(sanitized);
            await txBooks.objectStore(BOOK_META_STORE).put(toLibraryBook(sanitized));
            if (sanitized.cover) {
                await txBooks.objectStore(BOOK_COVER_STORE).put({ id: sanitized.id, cover: sanitized.cover });
            } else {
                await txBooks.objectStore(BOOK_COVER_STORE).delete(sanitized.id);
            }
        }
        await txBooks.done;

        return true;
    } catch (e) {
        devError('Import failed:', e);
        return false;
    }
};

// User Progress (Gamification)
const DEFAULT_PROGRESS: UserProgress = {
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

// ... User Progress ...
export const getUserProgress = async (): Promise<UserProgress> => {
    const db = await initDB();
    const progress = await db.get(STORE_NAME, 'default');
    return progress || DEFAULT_PROGRESS;
};

export const updateUserProgress = async (updates: Partial<UserProgress>, sync = true) => {
    const db = await initDB();
    const current = await getUserProgress();
    const updated = { ...current, ...updates };
    await db.put(STORE_NAME, updated);

    if (sync) {
        await syncProgressToCloud(updated);
    }
};
