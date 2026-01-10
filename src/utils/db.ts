import { openDB } from 'idb';
import { supabase } from '../lib/supabase';

const DB_NAME = 'ReadingTrainerDB';
const BOOKS_STORE = 'books';
const SESSIONS_STORE = 'sessions';
const STORE_NAME = 'progress';
const SYNC_QUEUE_STORE = 'sync_queue';
const DB_VERSION = 3; // Incremented for sync queue

export interface Book {
    id: string;
    title: string;
    content: string; // Changed from 'text' to 'content'
    progress: number; // 0 to 1
    totalWords: number;
    cover?: string; // Base64 image string
    // Legacy fields
    text?: string;
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
    id?: number; // Auto-incremented
    type: 'UPDATE_PROGRESS' | 'SYNC_SESSION' | 'SYNC_BOOK' | 'DELETE_BOOK';
    payload: SyncPayload;
    timestamp: number;
}

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) { // Removed oldVersion, newVersion, transaction from signature
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
                db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(BOOKS_STORE)) {
                db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
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
    await db.put(SYNC_QUEUE_STORE, { type, payload, timestamp: Date.now() });
};

// Cloud Sync Helpers with Queue Strategy
const syncProgressToCloud = async (progress: UserProgress) => {
    if (!navigator.onLine) {
        await addToSyncQueue('UPDATE_PROGRESS', progress);
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase
        .from('user_progress')
        .upsert({
            user_id: session.user.id,
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
        console.error('Cloud Sync Error (Progress):', error);
        await addToSyncQueue('UPDATE_PROGRESS', progress);
    }
};

const syncSessionToCloud = async (s: Session) => {
    if (!navigator.onLine) {
        await addToSyncQueue('SYNC_SESSION', s);
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase
        .from('reading_sessions')
        .upsert({
            id: s.id,
            user_id: session.user.id,
            book_id: s.bookId,
            duration_seconds: s.durationSeconds,
            words_read: s.wordsRead,
            average_wpm: s.averageWpm,
            timestamp: s.timestamp
        });

    if (error) {
        console.error('Cloud Sync Error (Session):', error);
        await addToSyncQueue('SYNC_SESSION', s);
    }
};

const syncBookToCloud = async (book: Book) => {
    if (!navigator.onLine) {
        await addToSyncQueue('SYNC_BOOK', book);
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase
        .from('books')
        .upsert({
            id: book.id,
            user_id: session.user.id,
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
        console.error('Cloud Sync Error (Book):', error);
        await addToSyncQueue('SYNC_BOOK', book);
    }
};

const deleteBookFromCloud = async (id: string) => {
    if (!navigator.onLine) {
        await addToSyncQueue('DELETE_BOOK', id);
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase.from('books').delete().eq('id', id);
    if (error) {
        console.error('Cloud Sync Error (Delete Book):', error);
        await addToSyncQueue('DELETE_BOOK', id);
    }
};

// Main Sync Function (Pull from Cloud)
export const syncFromCloud = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // 1. Get Progress
    const { data: cloudProgress } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

    if (cloudProgress) {
        // Map back to local format
        const localProgress: UserProgress = {
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
        // Update local without triggering another sync loop ideally,
        // but updateUserProgress is fine as it's an upsert.
        await updateUserProgress(localProgress, false); // Add flag to skip upload
    }

    // 2. Get Books
    const { data: cloudBooks } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', session.user.id);

    if (cloudBooks && cloudBooks.length > 0) {
        const db = await initDB();
        const tx = db.transaction(BOOKS_STORE, 'readwrite');
        for (const cb of cloudBooks) {
            // Only overwrite if cloud is newer or local doesn't exist?
            // For simplicity, cloud is truth.
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
            await tx.store.put(localBook);
        }
        await tx.done;
    }

    // 3. Get Sessions (Fix for empty sessions table)
    const { data: cloudSessions } = await supabase
        .from('reading_sessions')
        .select('*')
        .eq('user_id', session.user.id);

    if (cloudSessions && cloudSessions.length > 0) {
        const db = await initDB();
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        for (const cs of cloudSessions) {
            const localSession: Session = {
                id: cs.id,
                bookId: cs.book_id,
                durationSeconds: cs.duration_seconds,
                wordsRead: cs.words_read,
                averageWpm: cs.average_wpm,
                timestamp: cs.timestamp
            };
            await tx.store.put(localSession);
        }
        await tx.done;
    }

    return true;
};

export const processSyncQueue = async () => {
    if (!navigator.onLine) return;

    const db = await initDB();
    const queue = await db.getAll(SYNC_QUEUE_STORE);
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} offline items...`);

    // Process one by one. If success, connect to delete.
    // If fail, keep it? Or move to back? 
    // Simple approach: Try all, delete success ones.

    for (const item of queue) {
        let success = false;
        try {
            if (item.type === 'UPDATE_PROGRESS') {
                await syncProgressToCloud(item.payload);
                // Note: syncProgressToCloud adds back to queue on error. 
                // Ideally we call the internal supabase logic directly to avoid infinite loop of re-queueing immediately 
                // but checking navigator.onLine inside might prevent re-queueing if we are strictly online.
                // However, separating "sync" from "queue" logic would be cleaner. 
                // For now, let's assume sync functions re-queue only if error, 
                // so if we succeed here, good. 
                // Actually, the sync functions *do* re-queue on error. 
                // So we should delete *this* item first, then call sync. 
                // If sync fails, it will add a *new* item. 
                // This is acceptable for now.
                success = true; // If syncProgressToCloud throws, we catch. If it returns (even if error inside logged), it might have re-queued.
            } else if (item.type === 'SYNC_SESSION') {
                await syncSessionToCloud(item.payload);
                success = true;
            } else if (item.type === 'SYNC_BOOK') {
                await syncBookToCloud(item.payload);
                success = true;
            } else if (item.type === 'DELETE_BOOK') {
                await deleteBookFromCloud(item.payload);
                success = true;
            }
        } catch (e) {
            console.error('Error processing sync item:', e);
        }

        if (success) {
            // We blindly delete the OLD item. 
            // If the sync function failed and re-queued, it created a NEW item with new timestamp.
            // So we can safely remove this old one.
            if (item.id) await db.delete(SYNC_QUEUE_STORE, item.id);
        }
    }
};

export const saveBook = async (book: Book) => {
    const db = await initDB();
    const val = {
        ...book,
        content: book.content || book.text || '',
    };
    await db.put(BOOKS_STORE, val);
    syncBookToCloud(val);
};

export const getBooks = async (): Promise<Book[]> => {
    const db = await initDB();
    const books = await db.getAll(BOOKS_STORE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return books.map((b: any) => ({
        ...b,
        content: b.content || b.text || '',
        totalWords: b.totalWords || (b.content || b.text || '').trim().split(/\s+/).length
    }));
};

export const getBook = async (id: string): Promise<Book | undefined> => {
    const db = await initDB();
    const book = await db.get(BOOKS_STORE, id);
    if (book) {
        return {
            ...book,
            content: book.content || book.text || ''
        }
    }
    return undefined;
};

export const updateBookProgress = async (id: string, progress: number, currentIndex?: number, wpm?: number) => {
    const db = await initDB();
    const book = await db.get(BOOKS_STORE, id);
    if (book) {
        book.progress = progress;
        if (currentIndex !== undefined) book.currentIndex = currentIndex;
        book.lastRead = Date.now();
        if (wpm) book.wpm = wpm;
        await db.put(BOOKS_STORE, book);
        syncBookToCloud(book);
    }
};

export const deleteBook = async (id: string) => {
    const db = await initDB();
    await db.delete(BOOKS_STORE, id);
    deleteBookFromCloud(id);
};

export const logSession = async (session: Session) => {
    const db = await initDB();
    await db.put(SESSIONS_STORE, session);
    syncSessionToCloud(session);
};

export const getSessions = async (): Promise<Session[]> => {
    const db = await initDB();
    return db.getAll(SESSIONS_STORE); // Changed from getAllFromIndex to getAll
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

    const data = {
        version: 1,
        timestamp: Date.now(),
        progress,
        sessions,
        books: books.map(b => ({ ...b, cover: undefined })) // Optional: exclude large covers to keep file size small? keeping for now but good consideration
    };

    // Actually, users probably want their books too.
    // If books have large base64 covers, this file could be huge. 
    // Let's include everything for a full backup.
    return JSON.stringify({
        ...data,
        books // Overwrite with full book data
    });
};

export const importUserData = async (jsonString: string): Promise<boolean> => {
    try {
        const data = JSON.parse(jsonString);

        // Basic validation
        if (!data.progress || !data.sessions || !data.books) {
            throw new Error('Invalid data format');
        }

        // Clear existing data? Or merge?
        // For simplicity: Overwrite/Merge logic
        // We will overwrite progress, merge sessions/books (deduplicating by ID)

        await updateUserProgress(data.progress);

        const db = await initDB();

        // Import Sessions
        const txSession = db.transaction('sessions', 'readwrite');
        for (const s of data.sessions) {
            await txSession.store.put(s);
        }
        await txSession.done;

        // Import Books
        const txBooks = db.transaction('books', 'readwrite');
        for (const b of data.books) {
            await txBooks.store.put(b);
        }
        await txBooks.done;

        return true;
    } catch (e) {
        console.error('Import failed:', e);
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
        syncProgressToCloud(updated);
    }
};

