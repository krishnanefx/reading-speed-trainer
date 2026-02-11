import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportExportHelpers } from '../../src/utils/db/importExport.js';
import {
  DEFAULT_PROGRESS,
  computeChecksum,
  normalizeBackupPayload,
  sanitizeBook,
  sanitizeSession,
  toDateKey,
  toLibraryBook,
  toSafeNumber,
  type Book,
  type Session,
} from '../../src/utils/db/models.js';

type AnyRecord = Record<string, unknown>;

const createFakeDb = () => {
  const stores = new Map<string, Map<string, AnyRecord>>();

  const getStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };

  const transaction = (names: string | string[]) => {
    const allNames = Array.isArray(names) ? names : [names];
    return {
      store: {
        put: async (value: AnyRecord) => {
          const store = getStore(allNames[0]!);
          store.set(String(value.id), value);
        },
      },
      objectStore: (name: string) => ({
        put: async (value: AnyRecord) => {
          getStore(name).set(String(value.id), value);
        },
        delete: async (id: string) => {
          getStore(name).delete(String(id));
        },
      }),
      done: Promise.resolve(),
    };
  };

  return {
    transaction,
    read: (name: string) => [...getStore(name).values()],
  };
};

const mkBook = (): Book => ({
  id: 'b1',
  title: 'Book 1',
  content: 'one two three',
  progress: 0.3,
  totalWords: 3,
});

const mkSession = (): Session => ({
  id: 's1',
  bookId: 'b1',
  timestamp: 1,
  durationSeconds: 10,
  wordsRead: 50,
  averageWpm: 300,
});

test('exportUserData emits versioned payload with checksum', async () => {
  const helpers = createImportExportHelpers({
    maxImportSizeBytes: 10_000,
    maxImportItems: 100,
    sessionsStore: 'sessions',
    booksStore: 'books',
    bookMetaStore: 'book_meta',
    bookCoverStore: 'book_covers',
    defaultProgress: DEFAULT_PROGRESS,
    computeChecksum,
    normalizeBackupPayload,
    sanitizeSession,
    sanitizeBook,
    toLibraryBook,
    toSafeNumber,
    toDateKey,
    getUserProgress: async () => DEFAULT_PROGRESS,
    getSessions: async () => [mkSession()],
    getBooks: async () => [mkBook()],
    updateUserProgress: async () => {},
    initDB: async () => createFakeDb() as never,
    logError: () => {},
    now: () => 123,
  });

  const raw = await helpers.exportUserData();
  const parsed = JSON.parse(raw) as { version: number; timestamp: number; payload: AnyRecord; checksum: string };
  assert.equal(parsed.version, 2);
  assert.equal(parsed.timestamp, 123);
  assert.equal(parsed.checksum, computeChecksum(parsed.payload));
});

test('importUserData writes sessions/books and updates progress', async () => {
  const fakeDb = createFakeDb();
  let updatedWords = -1;

  const helpers = createImportExportHelpers({
    maxImportSizeBytes: 100_000,
    maxImportItems: 100,
    sessionsStore: 'sessions',
    booksStore: 'books',
    bookMetaStore: 'book_meta',
    bookCoverStore: 'book_covers',
    defaultProgress: DEFAULT_PROGRESS,
    computeChecksum,
    normalizeBackupPayload,
    sanitizeSession,
    sanitizeBook,
    toLibraryBook,
    toSafeNumber,
    toDateKey,
    getUserProgress: async () => DEFAULT_PROGRESS,
    getSessions: async () => [],
    getBooks: async () => [],
    updateUserProgress: async (updates) => {
      const typed = updates as Record<string, unknown>;
      updatedWords = Number(typed.totalWordsRead ?? -1);
    },
    initDB: async () => fakeDb as never,
    logError: () => {},
  });

  const payload = {
    progress: {
      id: 'default',
      currentStreak: 2,
      longestStreak: 3,
      totalWordsRead: 999,
      peakWpm: 450,
      dailyGoal: 7000,
      dailyGoalMetCount: 4,
      unlockedAchievements: ['a1'],
      lastReadDate: '2026-02-01',
      gymBestTime: 12,
    },
    sessions: [mkSession()],
    books: [mkBook()],
  };

  const backup = JSON.stringify({
    version: 2,
    timestamp: Date.now(),
    payload,
    checksum: computeChecksum(payload),
  });

  const ok = await helpers.importUserData(backup);
  assert.equal(ok, true);
  assert.equal(updatedWords, 999);
  assert.equal(fakeDb.read('sessions').length, 1);
  assert.equal(fakeDb.read('books').length, 1);
  assert.equal(fakeDb.read('book_meta').length, 1);
});
