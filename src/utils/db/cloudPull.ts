import type { IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Book, Session, SyncStatus, UserProgress } from './models';

interface CloudPullDependencies {
    supabase: SupabaseClient | null;
    isCloudAvailable: () => boolean;
    getSessionUserId: () => Promise<string | null>;
    updateSyncStatus: (updates: Partial<SyncStatus>) => void;
    scheduleSyncRetry: (reason: unknown) => void;
    getUserProgress: () => Promise<UserProgress>;
    updateUserProgress: (updates: Partial<UserProgress>, sync?: boolean) => Promise<void>;
    syncProgressToCloud: (progress: UserProgress, queueOnFailure?: boolean) => Promise<boolean>;
    initDB: () => Promise<IDBPDatabase<unknown>>;
    getBooks: () => Promise<Book[]>;
    sanitizeBook: (book: Partial<Book>) => Book;
    toLibraryBook: (book: Partial<Book>) => { id: string };
    resolveBookConflict: (local: Book, cloud: Book) => { winner: 'local' | 'cloud'; book: Book };
    syncBookToCloud: (book: Book, queueOnFailure?: boolean) => Promise<boolean>;
    getSessions: () => Promise<Session[]>;
    sanitizeSession: (session: Partial<Session>) => Session;
    resolveSessionConflict: (local: Session, cloud: Session) => { winner: 'local' | 'cloud'; session: Session };
    syncSessionToCloud: (session: Session, queueOnFailure?: boolean) => Promise<boolean>;
    mergeProgress: (local: UserProgress, cloud: UserProgress) => UserProgress;
    booksStore: string;
    bookMetaStore: string;
    bookCoverStore: string;
    sessionsStore: string;
}

interface CloudPullHelpers {
    syncFromCloud: () => Promise<boolean>;
}

const toRecord = (value: unknown): Record<string, unknown> => {
    if (typeof value === 'object' && value !== null) {
        return value as Record<string, unknown>;
    }
    return {};
};

const toString = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') return value;
    if (value == null) return fallback;
    return String(value);
};

const toNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const createCloudPullHelpers = (deps: CloudPullDependencies): CloudPullHelpers => {
    const syncFromCloud = async (): Promise<boolean> => {
        if (!deps.isCloudAvailable() || !deps.supabase) return false;
        const userId = await deps.getSessionUserId();
        if (!userId) return false;
        deps.updateSyncStatus({ phase: 'syncing', lastError: null, nextRetryAt: null });

        try {
            const { data: cloudProgress, error: progressError } = await deps.supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (progressError) {
                throw progressError;
            } else if (cloudProgress) {
                const cloudProgressRecord = toRecord(cloudProgress);
                const localProgress = await deps.getUserProgress();
                const mappedCloudProgress: UserProgress = {
                    id: 'default',
                    currentStreak: toNumber(cloudProgressRecord.current_streak),
                    longestStreak: toNumber(cloudProgressRecord.longest_streak),
                    totalWordsRead: toNumber(cloudProgressRecord.total_words_read),
                    peakWpm: toNumber(cloudProgressRecord.peak_wpm),
                    dailyGoal: toNumber(cloudProgressRecord.daily_goal),
                    gymBestTime: cloudProgressRecord.gym_best_time == null ? null : toNumber(cloudProgressRecord.gym_best_time),
                    unlockedAchievements: Array.isArray(cloudProgressRecord.unlocked_achievements)
                        ? cloudProgressRecord.unlocked_achievements.map((item) => toString(item))
                        : [],
                    lastReadDate: toString(cloudProgressRecord.last_read_date),
                    dailyGoalMetCount: 0,
                    defaultWpm: cloudProgressRecord.default_wpm == null ? undefined : toNumber(cloudProgressRecord.default_wpm),
                    defaultChunkSize: cloudProgressRecord.default_chunk_size == null ? undefined : toNumber(cloudProgressRecord.default_chunk_size),
                    defaultFont: cloudProgressRecord.default_font == null ? undefined : toString(cloudProgressRecord.default_font),
                    theme: cloudProgressRecord.theme == null ? undefined : toString(cloudProgressRecord.theme),
                    autoAccelerate: cloudProgressRecord.auto_accelerate == null ? undefined : Boolean(cloudProgressRecord.auto_accelerate),
                    bionicMode: cloudProgressRecord.bionic_mode == null ? undefined : Boolean(cloudProgressRecord.bionic_mode),
                };
                const merged = deps.mergeProgress(localProgress, mappedCloudProgress);
                await deps.updateUserProgress(merged, false);
                await deps.syncProgressToCloud(merged, false);
            }

            const { data: cloudBooks, error: booksError } = await deps.supabase
                .from('books')
                .select('*')
                .eq('user_id', userId);

            if (booksError) {
                throw booksError;
            } else if (cloudBooks) {
                const db = await deps.initDB();
                const localBooks = await deps.getBooks();
                const localById = new Map(localBooks.map((book) => [book.id, book]));
                const tx = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');

                for (const cloudBookRaw of cloudBooks) {
                    const cloudBook = toRecord(cloudBookRaw);
                    const localBook: Book = {
                        id: toString(cloudBook.id),
                        title: toString(cloudBook.title, 'Untitled'),
                        content: toString(cloudBook.content),
                        progress: toNumber(cloudBook.progress),
                        totalWords: toNumber(cloudBook.total_words),
                        currentIndex: toNumber(cloudBook.current_index),
                        lastRead: toNumber(cloudBook.last_read),
                        wpm: toNumber(cloudBook.wpm),
                        cover: cloudBook.cover == null ? undefined : toString(cloudBook.cover),
                    };
                    const existing = localById.get(localBook.id);
                    if (existing) {
                        const resolved = deps.resolveBookConflict(existing, localBook);
                        await tx.objectStore(deps.booksStore).put(deps.sanitizeBook(resolved.book));
                        await tx.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(resolved.book));
                        if (resolved.book.cover) {
                            await tx.objectStore(deps.bookCoverStore).put({ id: resolved.book.id, cover: resolved.book.cover });
                        } else {
                            await tx.objectStore(deps.bookCoverStore).delete(resolved.book.id);
                        }
                        if (resolved.winner === 'local') {
                            await deps.syncBookToCloud(existing, false);
                        }
                    } else {
                        const sanitized = deps.sanitizeBook(localBook);
                        await tx.objectStore(deps.booksStore).put(sanitized);
                        await tx.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(sanitized));
                        if (sanitized.cover) {
                            await tx.objectStore(deps.bookCoverStore).put({ id: sanitized.id, cover: sanitized.cover });
                        } else {
                            await tx.objectStore(deps.bookCoverStore).delete(sanitized.id);
                        }
                    }
                }

                const cloudIds = new Set(cloudBooks.map((book) => toString(toRecord(book).id)));
                for (const localBook of localBooks) {
                    if (!cloudIds.has(localBook.id)) {
                        await deps.syncBookToCloud(localBook, false);
                    }
                }
                await tx.done;
            }

            const { data: cloudSessions, error: sessionsError } = await deps.supabase
                .from('reading_sessions')
                .select('*')
                .eq('user_id', userId);

            if (sessionsError) {
                throw sessionsError;
            } else if (cloudSessions) {
                const db = await deps.initDB();
                const localSessions = await deps.getSessions();
                const localById = new Map(localSessions.map((session) => [session.id, deps.sanitizeSession(session)]));
                const cloudById = new Map<string, Session>();
                const tx = db.transaction(deps.sessionsStore, 'readwrite');

                for (const cloudSessionRaw of cloudSessions) {
                    const cloudSessionRecord = toRecord(cloudSessionRaw);
                    const cloudSession = deps.sanitizeSession({
                        id: toString(cloudSessionRecord.id),
                        bookId: toString(cloudSessionRecord.book_id),
                        durationSeconds: toNumber(cloudSessionRecord.duration_seconds),
                        wordsRead: toNumber(cloudSessionRecord.words_read),
                        averageWpm: toNumber(cloudSessionRecord.average_wpm),
                        timestamp: toNumber(cloudSessionRecord.timestamp)
                    });
                    cloudById.set(cloudSession.id, cloudSession);
                    const localSession = localById.get(cloudSession.id);
                    if (!localSession) {
                        await tx.store.put(cloudSession);
                        continue;
                    }

                    const resolved = deps.resolveSessionConflict(localSession, cloudSession);
                    await tx.store.put(resolved.session);
                    if (resolved.winner === 'local') {
                        await deps.syncSessionToCloud(localSession, false);
                    }
                }

                for (const localSession of localById.values()) {
                    if (!cloudById.has(localSession.id)) {
                        await tx.store.put(localSession);
                        await deps.syncSessionToCloud(localSession, false);
                    }
                }
                await tx.done;
            }

            deps.updateSyncStatus({
                phase: 'idle',
                retryAttempts: 0,
                nextRetryAt: null,
                lastError: null,
                lastSyncedAt: Date.now(),
            });
            return true;
        } catch (error) {
            deps.scheduleSyncRetry(error);
            return false;
        }
    };

    return { syncFromCloud };
};
