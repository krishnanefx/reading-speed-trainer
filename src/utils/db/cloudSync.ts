import type { SupabaseClient } from '@supabase/supabase-js';
import type { Book, Session, SyncItem, SyncPayload, UserProgress } from './models';

interface CloudSyncDependencies {
    supabase: SupabaseClient | null;
    isCloudAvailable: () => boolean;
    isOnline: () => boolean;
    getSessionUserId: () => Promise<string | null>;
    addToSyncQueue: (type: SyncItem['type'], payload: SyncPayload) => Promise<void>;
    logError: (message: string, error: unknown) => void;
    now?: () => number;
}

interface CloudSyncHelpers {
    syncProgressToCloud: (progress: UserProgress, queueOnFailure?: boolean) => Promise<boolean>;
    syncSessionToCloud: (session: Session, queueOnFailure?: boolean) => Promise<boolean>;
    syncBookToCloud: (book: Book, queueOnFailure?: boolean) => Promise<boolean>;
    deleteBookFromCloud: (id: string, queueOnFailure?: boolean) => Promise<boolean>;
}

export const createCloudSyncHelpers = (deps: CloudSyncDependencies): CloudSyncHelpers => {
    const enqueue = async (type: SyncItem['type'], payload: SyncPayload, queueOnFailure: boolean) => {
        if (!queueOnFailure) return;
        await deps.addToSyncQueue(type, payload);
    };

    const withCloudSession = async (): Promise<{ supabase: SupabaseClient; userId: string } | null> => {
        if (!deps.isCloudAvailable()) return null;
        if (!deps.isOnline()) return null;
        if (!deps.supabase) return null;
        const userId = await deps.getSessionUserId();
        if (!userId) return null;
        return { supabase: deps.supabase, userId };
    };

    const syncProgressToCloud = async (progress: UserProgress, queueOnFailure = true): Promise<boolean> => {
        const session = await withCloudSession();
        if (!session) {
            await enqueue('UPDATE_PROGRESS', progress, queueOnFailure);
            return false;
        }

        const { error } = await session.supabase
            .from('user_progress')
            .upsert({
                user_id: session.userId,
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
            deps.logError('Cloud Sync Error (Progress):', error);
            await enqueue('UPDATE_PROGRESS', progress, queueOnFailure);
            return false;
        }

        return true;
    };

    const syncSessionToCloud = async (sessionData: Session, queueOnFailure = true): Promise<boolean> => {
        const session = await withCloudSession();
        if (!session) {
            await enqueue('SYNC_SESSION', sessionData, queueOnFailure);
            return false;
        }

        const { error } = await session.supabase
            .from('reading_sessions')
            .upsert({
                id: sessionData.id,
                user_id: session.userId,
                book_id: sessionData.bookId,
                duration_seconds: sessionData.durationSeconds,
                words_read: sessionData.wordsRead,
                average_wpm: sessionData.averageWpm,
                timestamp: sessionData.timestamp
            });

        if (error) {
            deps.logError('Cloud Sync Error (Session):', error);
            await enqueue('SYNC_SESSION', sessionData, queueOnFailure);
            return false;
        }

        return true;
    };

    const syncBookToCloud = async (book: Book, queueOnFailure = true): Promise<boolean> => {
        const session = await withCloudSession();
        if (!session) {
            await enqueue('SYNC_BOOK', book, queueOnFailure);
            return false;
        }

        const { error } = await session.supabase
            .from('books')
            .upsert({
                id: book.id,
                user_id: session.userId,
                title: book.title,
                content: book.content,
                progress: book.progress,
                total_words: book.totalWords,
                current_index: book.currentIndex || 0,
                last_read: book.lastRead || (deps.now || Date.now)(),
                wpm: book.wpm,
                cover: book.cover
            });

        if (error) {
            deps.logError('Cloud Sync Error (Book):', error);
            await enqueue('SYNC_BOOK', book, queueOnFailure);
            return false;
        }

        return true;
    };

    const deleteBookFromCloud = async (id: string, queueOnFailure = true): Promise<boolean> => {
        const session = await withCloudSession();
        if (!session) {
            await enqueue('DELETE_BOOK', id, queueOnFailure);
            return false;
        }

        const { error } = await session.supabase
            .from('books')
            .delete()
            .eq('id', id)
            .eq('user_id', session.userId);

        if (error) {
            deps.logError('Cloud Sync Error (Delete Book):', error);
            await enqueue('DELETE_BOOK', id, queueOnFailure);
            return false;
        }

        return true;
    };

    return {
        syncProgressToCloud,
        syncSessionToCloud,
        syncBookToCloud,
        deleteBookFromCloud,
    };
};
