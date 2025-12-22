import { openDB } from 'idb';
import { supabase } from '../lib/supabase';

const DB_NAME = 'ReadingTrainerDB';
const BOOKS_STORE = 'books';
const SESSIONS_STORE = 'sessions';
const STORE_NAME = 'progress'; // Renamed from PROGRESS_STORE to STORE_NAME as per instruction
const DB_VERSION = 2; // Incremented for sessions store, and now progress store

export interface Book {
    id: string;
    title: string;
    content: string; // Changed from 'text' to 'content'
    progress: number; // 0 to 1
    totalWords: number;
    cover?: string; // Base64 image string
    // Legacy fields that might be passed but we are moving away from or need to add back if critical
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
        },
    });
};

// Cloud Sync Helpers
const syncProgressToCloud = async (progress: UserProgress) => {
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

    if (error) console.error('Cloud Sync Error (Progress):', error);
};

const syncSessionToCloud = async (s: Session) => {
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

    if (error) console.error('Cloud Sync Error (Session):', error);
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
            dailyGoalMetCount: 0 // Not synced yet in SQL schema, keeping local or default
        };
        // Update local without triggering another sync loop ideally,
        // but updateUserProgress is fine as it's an upsert.
        await updateUserProgress(localProgress, false); // Add flag to skip upload
    }

    // 2. Get Sessions? (Maybe too many to sync all at once on every load.
    // For now, let's just sync progress as that's the critical gamification part.)

    return true;
};

export const saveBook = async (book: Book) => {
    const db = await initDB();
    return db.put(BOOKS_STORE, book);
};

export const getBooks = async (): Promise<Book[]> => {
    const db = await initDB();
    return db.getAll(BOOKS_STORE);
};

export const getBook = async (id: string): Promise<Book | undefined> => {
    const db = await initDB();
    return db.get(BOOKS_STORE, id);
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
    }
};

export const deleteBook = async (id: string) => {
    const db = await initDB();
    return db.delete(BOOKS_STORE, id);
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

