import { toSafeNumber, type Book, type Session, type SyncItem, type SyncPayload } from './models.js';

export const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim().length > 0) return error;
    return 'Sync failed';
};

export const getSyncRetryDelayMs = (attempt: number, baseRetryMs: number): number => {
    return Math.min(baseRetryMs * (2 ** Math.max(0, attempt - 1)), 60_000);
};

export const getSyncItemKey = (type: SyncItem['type'], payload: SyncPayload): string => {
    if (type === 'UPDATE_PROGRESS') return 'UPDATE_PROGRESS:default';
    if (type === 'SYNC_BOOK') return `SYNC_BOOK:${(payload as Book).id}`;
    if (type === 'DELETE_BOOK') return `DELETE_BOOK:${payload as string}`;
    return `SYNC_SESSION:${(payload as Session).id}`;
};

export const normalizeSyncItem = (item: SyncItem): SyncItem => {
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

export const computeQueueStatus = (queue: SyncItem[]) => {
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

export const dedupeSyncQueue = (items: SyncItem[]): SyncItem[] => {
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
