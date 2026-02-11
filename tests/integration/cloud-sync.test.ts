import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSyncHelpers } from '../../src/utils/db/cloudSync.js';

type QueueItem = { type: string; payload: unknown };

const createDeps = ({
  isOnline,
  upsertError = null,
}: {
  isOnline: boolean;
  upsertError?: unknown;
}) => {
  const queue: QueueItem[] = [];

  const supabase = {
    from: (table: string) => ({
      upsert: async (payload: unknown) => {
        void table;
        void payload;
        return { error: upsertError };
      },
      delete: () => ({
        eq: (key: string, value: string) => ({
          eq: async (k2: string, v2: string) => {
            void key;
            void value;
            void k2;
            void v2;
            return { error: upsertError };
          },
        }),
      }),
    }),
  } as const;

  const helpers = createCloudSyncHelpers({
    supabase: supabase as never,
    isCloudAvailable: () => true,
    isOnline: () => isOnline,
    getSessionUserId: async () => 'u1',
    addToSyncQueue: async (type, payload) => {
      queue.push({ type, payload });
    },
    logError: () => {},
  });

  return { helpers, queue };
};

test('syncProgressToCloud queues when offline', async () => {
  const { helpers, queue } = createDeps({ isOnline: false });

  const ok = await helpers.syncProgressToCloud({
    id: 'default',
    currentStreak: 0,
    longestStreak: 0,
    totalWordsRead: 0,
    peakWpm: 0,
    dailyGoal: 5000,
    dailyGoalMetCount: 0,
    unlockedAchievements: [],
    lastReadDate: '',
    gymBestTime: null,
  });

  assert.equal(ok, false);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.type, 'UPDATE_PROGRESS');
});

test('syncSessionToCloud succeeds online without queue', async () => {
  const { helpers, queue } = createDeps({ isOnline: true, upsertError: null });

  const ok = await helpers.syncSessionToCloud({
    id: 's1',
    bookId: 'b1',
    timestamp: 1,
    durationSeconds: 10,
    wordsRead: 50,
    averageWpm: 300,
  });

  assert.equal(ok, true);
  assert.equal(queue.length, 0);
});

test('syncBookToCloud queues on cloud error', async () => {
  const { helpers, queue } = createDeps({ isOnline: true, upsertError: { message: 'boom' } });

  const ok = await helpers.syncBookToCloud({
    id: 'b1',
    title: 'Book',
    content: 'a b c',
    progress: 0,
    totalWords: 3,
  });

  assert.equal(ok, false);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.type, 'SYNC_BOOK');
});
