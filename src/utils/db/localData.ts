import type { IDBPDatabase } from 'idb';
import type { Book, LibraryBook, Session } from './models';

interface LocalDataDependencies {
    initDB: () => Promise<IDBPDatabase<unknown>>;
    booksStore: string;
    bookMetaStore: string;
    bookCoverStore: string;
    sessionsStore: string;
    sanitizeBook: (book: Partial<Book>) => Book;
    toLibraryBook: (book: Partial<Book>) => LibraryBook;
    toSafeNumber: (value: unknown, fallback: number, min?: number, max?: number) => number;
    sanitizeSession: (session: Partial<Session>) => Session;
    syncBookToCloud: (book: Book, queueOnFailure?: boolean) => Promise<boolean>;
    deleteBookFromCloud: (id: string, queueOnFailure?: boolean) => Promise<boolean>;
    syncSessionToCloud: (session: Session, queueOnFailure?: boolean) => Promise<boolean>;
}

interface LocalDataHelpers {
    saveBook: (book: Book) => Promise<void>;
    getBooks: () => Promise<Book[]>;
    getLibraryBooks: () => Promise<LibraryBook[]>;
    getLibraryBookCovers: (bookIds: string[]) => Promise<Record<string, string>>;
    getBookCount: () => Promise<number>;
    rebuildLibraryBookIndex: () => Promise<void>;
    getBook: (id: string) => Promise<Book | undefined>;
    updateBookProgress: (id: string, progress: number, currentIndex?: number, wpm?: number, sync?: boolean) => Promise<void>;
    deleteBook: (id: string) => Promise<void>;
    logSession: (session: Session) => Promise<void>;
    getSessions: () => Promise<Session[]>;
    clearSessions: () => Promise<void>;
}

export const createLocalDataHelpers = (deps: LocalDataDependencies): LocalDataHelpers => {
    const saveBook = async (book: Book) => {
        const db = await deps.initDB();
        const value = deps.sanitizeBook(book);
        const tx = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');
        await tx.objectStore(deps.booksStore).put(value);
        await tx.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(value));
        if (value.cover) {
            await tx.objectStore(deps.bookCoverStore).put({ id: value.id, cover: value.cover });
        } else {
            await tx.objectStore(deps.bookCoverStore).delete(value.id);
        }
        await tx.done;
        await deps.syncBookToCloud(value);
    };

    const getBooks = async (): Promise<Book[]> => {
        const db = await deps.initDB();
        const books = (await db.getAll(deps.booksStore)) as Partial<Book>[];
        return books.map((book) => {
            const content = String(book.content ?? book.text ?? '');
            return {
                ...deps.sanitizeBook(book),
                content,
                totalWords: deps.toSafeNumber(book.totalWords, Math.max(0, Math.round(content.length / 5)), 0),
            };
        });
    };

    const getLibraryBooks = async (): Promise<LibraryBook[]> => {
        const db = await deps.initDB();
        const meta = await db.getAll(deps.bookMetaStore);
        return meta.map((item) => {
            const typed = item as LibraryBook & { cover?: string };
            return {
                ...typed,
                hasCover: typed.hasCover ?? Boolean(typed.cover),
            };
        });
    };

    const getLibraryBookCovers = async (bookIds: string[]): Promise<Record<string, string>> => {
        const ids = Array.from(new Set(bookIds)).filter(Boolean);
        if (ids.length === 0) return {};
        const db = await deps.initDB();
        const entries = await Promise.all(ids.map((id) => db.get(deps.bookCoverStore, id)));
        const result: Record<string, string> = {};
        for (const entry of entries) {
            if (entry && typeof entry === 'object' && 'id' in entry && 'cover' in entry) {
                const typed = entry as { id: unknown; cover: unknown };
                if (typed.id && typeof typed.cover === 'string') {
                    result[String(typed.id)] = typed.cover;
                }
            }
        }
        return result;
    };

    const getBookCount = async (): Promise<number> => {
        const db = await deps.initDB();
        return db.count(deps.booksStore);
    };

    const rebuildLibraryBookIndex = async () => {
        const db = await deps.initDB();
        const tx = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');
        const books = await tx.objectStore(deps.booksStore).getAll();
        await tx.objectStore(deps.bookMetaStore).clear();
        await tx.objectStore(deps.bookCoverStore).clear();
        for (const book of books) {
            const typedBook = book as Partial<Book>;
            await tx.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(typedBook));
            if (typedBook.cover) {
                await tx.objectStore(deps.bookCoverStore).put({ id: String(typedBook.id), cover: typedBook.cover });
            }
        }
        await tx.done;
    };

    const getBook = async (id: string): Promise<Book | undefined> => {
        const db = await deps.initDB();
        const book = (await db.get(deps.booksStore, id)) as (Book & { text?: string }) | undefined;
        if (!book) return undefined;
        const coverEntry = (await db.get(deps.bookCoverStore, id)) as { cover?: string } | undefined;
        return {
            ...book,
            cover: coverEntry?.cover || book.cover,
            content: book.content || book.text || '',
        };
    };

    const updateBookProgress = async (
        id: string,
        progress: number,
        currentIndex?: number,
        wpm?: number,
        sync = true
    ) => {
        const db = await deps.initDB();
        const book = await db.get(deps.booksStore, id);
        if (!book || typeof book !== 'object') return;

        const typedBook = book as Partial<Book> & { id?: string };
        typedBook.progress = progress;
        if (currentIndex !== undefined) typedBook.currentIndex = currentIndex;
        typedBook.lastRead = Date.now();
        if (wpm) typedBook.wpm = deps.toSafeNumber(wpm, typedBook.wpm || 300, 60, 2000);

        const tx = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');
        await tx.objectStore(deps.booksStore).put(typedBook);
        await tx.objectStore(deps.bookMetaStore).put(deps.toLibraryBook(typedBook));
        if (typedBook.cover) {
            await tx.objectStore(deps.bookCoverStore).put({ id: String(typedBook.id), cover: typedBook.cover });
        } else {
            await tx.objectStore(deps.bookCoverStore).delete(String(typedBook.id));
        }
        await tx.done;

        if (sync) {
            await deps.syncBookToCloud(deps.sanitizeBook(typedBook));
        }
    };

    const deleteBook = async (id: string) => {
        const db = await deps.initDB();
        const tx = db.transaction([deps.booksStore, deps.bookMetaStore, deps.bookCoverStore], 'readwrite');
        await tx.objectStore(deps.booksStore).delete(id);
        await tx.objectStore(deps.bookMetaStore).delete(id);
        await tx.objectStore(deps.bookCoverStore).delete(id);
        await tx.done;
        await deps.deleteBookFromCloud(id);
    };

    const logSession = async (session: Session) => {
        const db = await deps.initDB();
        const safeSession = deps.sanitizeSession(session);
        await db.put(deps.sessionsStore, safeSession);
        await deps.syncSessionToCloud(safeSession);
    };

    const getSessions = async (): Promise<Session[]> => {
        const db = await deps.initDB();
        return (await db.getAll(deps.sessionsStore)) as Session[];
    };

    const clearSessions = async () => {
        const db = await deps.initDB();
        await db.clear(deps.sessionsStore);
    };

    return {
        saveBook,
        getBooks,
        getLibraryBooks,
        getLibraryBookCovers,
        getBookCount,
        rebuildLibraryBookIndex,
        getBook,
        updateBookProgress,
        deleteBook,
        logSession,
        getSessions,
        clearSessions,
    };
};
