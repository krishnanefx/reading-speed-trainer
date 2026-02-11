import { openDB } from 'idb';
import { isCloudSyncEnabled, supabase } from '../lib/supabase';
import { devError } from './logger';
import { createCloudSyncHelpers } from './db/cloudSync';
import { createCloudPullHelpers } from './db/cloudPull';
import { createImportExportHelpers } from './db/importExport';
import { createLocalDataHelpers } from './db/localData';
import { createProgressHelpers } from './db/progress';
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

const localDataHelpers = createLocalDataHelpers({
    initDB,
    booksStore: BOOKS_STORE,
    bookMetaStore: BOOK_META_STORE,
    bookCoverStore: BOOK_COVER_STORE,
    sessionsStore: SESSIONS_STORE,
    sanitizeBook,
    toLibraryBook,
    toSafeNumber,
    sanitizeSession,
    syncBookToCloud,
    deleteBookFromCloud,
    syncSessionToCloud,
});

export const saveBook = localDataHelpers.saveBook;
export const getBooks = localDataHelpers.getBooks;
export const getLibraryBooks = localDataHelpers.getLibraryBooks;
export const getLibraryBookCovers = localDataHelpers.getLibraryBookCovers;
export const getBookCount = localDataHelpers.getBookCount;
export const rebuildLibraryBookIndex = localDataHelpers.rebuildLibraryBookIndex;
export const getBook = localDataHelpers.getBook;
export const updateBookProgress = localDataHelpers.updateBookProgress;
export const deleteBook = localDataHelpers.deleteBook;
export const logSession = localDataHelpers.logSession;
export const getSessions = localDataHelpers.getSessions;
export const clearSessions = localDataHelpers.clearSessions;

const progressHelpers = createProgressHelpers({
    initDB,
    progressStore: STORE_NAME,
    defaultProgress: DEFAULT_PROGRESS,
    syncProgressToCloud,
});

export const getUserProgress = progressHelpers.getUserProgress;
export const updateUserProgress = progressHelpers.updateUserProgress;

const cloudPullHelpers = createCloudPullHelpers({
    supabase,
    isCloudAvailable,
    getSessionUserId,
    updateSyncStatus,
    scheduleSyncRetry,
    getUserProgress,
    updateUserProgress,
    syncProgressToCloud,
    initDB,
    getBooks,
    sanitizeBook,
    toLibraryBook,
    resolveBookConflict,
    syncBookToCloud,
    getSessions,
    sanitizeSession,
    resolveSessionConflict,
    syncSessionToCloud,
    mergeProgress,
    booksStore: BOOKS_STORE,
    bookMetaStore: BOOK_META_STORE,
    bookCoverStore: BOOK_COVER_STORE,
    sessionsStore: SESSIONS_STORE,
});

export const syncFromCloud = cloudPullHelpers.syncFromCloud;

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
