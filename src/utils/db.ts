import { openDB } from 'idb';
import { isCloudSyncEnabled, supabase } from '../lib/supabase';
import { devError } from './logger';
import { createCloudSyncHelpers } from './db/cloudSync';
import { createImportExportHelpers } from './db/importExport';
import {
    computeQueueStatus,
    dedupeSyncQueue,
    getSyncItemKey,
    getSyncRetryDelayMs,
    normalizeErrorMessage,
    normalizeSyncItem,
} from './db/syncQueue';
import {
    DEFAULT_PROGRESS,
    computeChecksum,
    mergeProgress,
    normalizeBackupPayload,
    resolveBookConflict,
    resolveSessionConflict,
    sanitizeBook,
    sanitizeSession,
    toDateKey,
    toLibraryBook,
    toSafeNumber,
    type Book,
    type LibraryBook,
    type Session,
    type SyncItem,
    type SyncPayload,
    type SyncStatus,
    type UserProgress,
} from './db/models';

export type {
    Book,
    LibraryBook,
    Session,
    SyncItem,
    SyncPayload,
    SyncStatus,
    UserProgress,
} from './db/models';

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

const {
    syncProgressToCloud,
    syncSessionToCloud,
    syncBookToCloud,
    deleteBookFromCloud,
} = createCloudSyncHelpers({
    supabase,
    isCloudAvailable,
    isOnline: () => navigator.onLine,
    getSessionUserId,
    addToSyncQueue,
    logError: devError,
});

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
            const nextRetryAt = maxed ? null : Date.now() + getSyncRetryDelayMs(attempt, BASE_SYNC_RETRY_MS);
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
            const nextRetryAt = maxed ? null : Date.now() + getSyncRetryDelayMs(attempt, BASE_SYNC_RETRY_MS);
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
    const books = await db.getAll(BOOKS_STORE) as Partial<Book>[];
    return books.map((book) => {
        const content = String(book.content ?? book.text ?? '');
        return {
            ...sanitizeBook(book),
            content,
            totalWords: toSafeNumber(book.totalWords, Math.max(0, Math.round(content.length / 5)), 0)
        };
    });
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

const importExportHelpers = createImportExportHelpers({
    maxImportSizeBytes: MAX_IMPORT_SIZE_BYTES,
    maxImportItems: MAX_IMPORT_ITEMS,
    sessionsStore: SESSIONS_STORE,
    booksStore: BOOKS_STORE,
    bookMetaStore: BOOK_META_STORE,
    bookCoverStore: BOOK_COVER_STORE,
    defaultProgress: DEFAULT_PROGRESS,
    computeChecksum,
    normalizeBackupPayload,
    sanitizeSession,
    sanitizeBook,
    toLibraryBook,
    toSafeNumber,
    toDateKey,
    getUserProgress,
    getSessions,
    getBooks,
    updateUserProgress: async (updates: Partial<UserProgress>) => updateUserProgress(updates, false),
    initDB,
    logError: devError,
});

export const exportUserData = importExportHelpers.exportUserData;
export const importUserData = importExportHelpers.importUserData;
