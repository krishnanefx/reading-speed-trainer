import type { IDBPDatabase } from 'idb';
import type { UserProgress } from './models';

interface ProgressDependencies {
    initDB: () => Promise<IDBPDatabase<unknown>>;
    progressStore: string;
    defaultProgress: UserProgress;
    syncProgressToCloud: (progress: UserProgress, queueOnFailure?: boolean) => Promise<boolean>;
}

interface ProgressHelpers {
    getUserProgress: () => Promise<UserProgress>;
    updateUserProgress: (updates: Partial<UserProgress>, sync?: boolean) => Promise<void>;
}

export const createProgressHelpers = (deps: ProgressDependencies): ProgressHelpers => {
    const getUserProgress = async (): Promise<UserProgress> => {
        const db = await deps.initDB();
        const progress = await db.get(deps.progressStore, 'default');
        return (progress as UserProgress | undefined) || deps.defaultProgress;
    };

    const updateUserProgress = async (updates: Partial<UserProgress>, sync = true) => {
        const db = await deps.initDB();
        const current = await getUserProgress();
        const updated = { ...current, ...updates };
        await db.put(deps.progressStore, updated);

        if (sync) {
            await deps.syncProgressToCloud(updated);
        }
    };

    return {
        getUserProgress,
        updateUserProgress,
    };
};
