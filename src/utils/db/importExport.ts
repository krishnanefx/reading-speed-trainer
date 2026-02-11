import type { IDBPDatabase } from 'idb';
import type { Book, Session, UserProgress } from './models';

interface ImportExportDependencies {
    maxImportSizeBytes: number;
    maxImportItems: number;
    sessionsStore: string;
    booksStore: string;
    bookMetaStore: string;
    bookCoverStore: string;
    defaultProgress: UserProgress;
    computeChecksum: (value: unknown) => string;
    normalizeBackupPayload: (raw: unknown, maxImportItems: number) => {
        progress: Partial<UserProgress>;
        sessions: Record<string, unknown>[];
        books: Record<string, unknown>[];
    };
    sanitizeSession: (session: Partial<Session>) => Session;
    sanitizeBook: (book: Partial<Book>) => Book;
    toLibraryBook: (book: Partial<Book>) => { id: string };
    toSafeNumber: (value: unknown, fallback: number, min?: number, max?: number) => number;
    toDateKey: (value: string | null | undefined) => string;
    getUserProgress: () => Promise<UserProgress>;
    getSessions: () => Promise<Session[]>;
    getBooks: () => Promise<Book[]>;
    updateUserProgress: (updates: Partial<UserProgress>) => Promise<void>;
    initDB: () => Promise<IDBPDatabase<unknown>>;
    logError: (message: string, error: unknown) => void;
    now?: () => number;
}

interface ImportExportHelpers {
    exportUserData: () => Promise<string>;
    importUserData: (jsonString: string) => Promise<boolean>;
}

export const createImportExportHelpers = (deps: ImportExportDependencies): ImportExportHelpers => {
    const exportUserData = async (): Promise<string> => {
        const progress = await deps.getUserProgress();
        const sessions = await deps.getSessions();
        const books = await deps.getBooks();

        const payload = {
            progress,
            sessions,
            books
        };
        const data = {
            version: 2,
            timestamp: (deps.now || Date.now)(),
            payload,
            checksum: deps.computeChecksum(payload)
        };
        return JSON.stringify(data);
    };

    const importUserData = async (jsonString: string): Promise<boolean> => {
        try {
            if (jsonString.length > deps.maxImportSizeBytes) {
                throw new Error('Import file is too large.');
            }

            const parsed = JSON.parse(jsonString) as unknown;
            const { progress: progressUpdate, sessions, books } = deps.normalizeBackupPayload(parsed, deps.maxImportItems);

            await deps.updateUserProgress({
                ...deps.defaultProgress,
                ...progressUpdate,
                id: 'default',
                currentStreak: deps.toSafeNumber(progressUpdate.currentStreak, 0, 0),
                longestStreak: deps.toSafeNumber(progressUpdate.longestStreak, 0, 0),
                totalWordsRead: deps.toSafeNumber(progressUpdate.totalWordsRead, 0, 0),
                peakWpm: deps.toSafeNumber(progressUpdate.peakWpm, 0, 0),
                dailyGoal: deps.toSafeNumber(progressUpdate.dailyGoal, 5000, 100, 500000),
                dailyGoalMetCount: deps.toSafeNumber(progressUpdate.dailyGoalMetCount, 0, 0),
                unlockedAchievements: Array.isArray(progressUpdate.unlockedAchievements)
                    ? progressUpdate.unlockedAchievements.filter((item): item is string => typeof item === 'string')
                    : [],
                lastReadDate: deps.toDateKey(progressUpdate.lastReadDate),
                gymBestTime: progressUpdate.gymBestTime ?? null,
            });

            const db = await deps.initDB();

            const txSession = db.transaction(deps.sessionsStore, 'readwrite');
            for (const session of sessions) {
                await txSession.store.put(deps.sanitizeSession(session));
            }
            await txSession.done;

            const txBooks = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');
            for (const book of books) {
                const sanitized = deps.sanitizeBook(book);
                await txBooks.objectStore(deps.booksStore).put(sanitized);
                await txBooks.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(sanitized));
                if (sanitized.cover) {
                    await txBooks.objectStore(deps.bookCoverStore).put({ id: sanitized.id, cover: sanitized.cover });
                } else {
                    await txBooks.objectStore(deps.bookCoverStore).delete(sanitized.id);
                }
            }
            await txBooks.done;

            return true;
        } catch (error) {
            deps.logError('Import failed:', error);
            return false;
        }
    };

    return {
        exportUserData,
        importUserData,
    };
};
