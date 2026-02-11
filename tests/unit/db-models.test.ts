import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress, resolveBookConflict, resolveSessionConflict, type Book, type Session, type UserProgress } from '../../src/utils/db/models.js';

const baseProgress = (): UserProgress => ({
  id: 'default',
  currentStreak: 1,
  longestStreak: 2,
  totalWordsRead: 100,
  peakWpm: 250,
  dailyGoal: 5000,
  dailyGoalMetCount: 1,
  unlockedAchievements: ['a1'],
  lastReadDate: '2026-01-01',
  gymBestTime: null,
});

test('mergeProgress keeps maxima and unions achievements', () => {
  const local: UserProgress = {
    ...baseProgress(),
    currentStreak: 3,
    longestStreak: 4,
    totalWordsRead: 500,
    peakWpm: 330,
    unlockedAchievements: ['a1', 'a2'],
    lastReadDate: '2026-01-10',
  };
  const cloud: UserProgress = {
    ...baseProgress(),
    currentStreak: 2,
    longestStreak: 6,
    totalWordsRead: 300,
    peakWpm: 320,
    unlockedAchievements: ['a0', 'a1'],
    lastReadDate: '2026-01-09',
  };

  const merged = mergeProgress(local, cloud);
  assert.equal(merged.currentStreak, 3);
  assert.equal(merged.longestStreak, 6);
  assert.equal(merged.totalWordsRead, 500);
  assert.equal(merged.peakWpm, 330);
  assert.deepEqual(new Set(merged.unlockedAchievements), new Set(['a0', 'a1', 'a2']));
  assert.equal(merged.lastReadDate, '2026-01-10');
});

test('resolveBookConflict prefers latest lastRead then progress', () => {
  const local: Book = {
    id: 'b1',
    title: 'Local',
    content: 'one two',
    progress: 0.3,
    totalWords: 2,
    lastRead: 100,
  };
  const cloudNewer: Book = { ...local, title: 'Cloud', lastRead: 200 };
  const newerWins = resolveBookConflict(local, cloudNewer);
  assert.equal(newerWins.winner, 'cloud');
  assert.equal(newerWins.book.title, 'Cloud');

  const equalTimestampCloudLowerProgress: Book = { ...local, progress: 0.1, lastRead: 100 };
  const progressWins = resolveBookConflict(local, equalTimestampCloudLowerProgress);
  assert.equal(progressWins.winner, 'local');
});

test('resolveSessionConflict uses latest timestamp', () => {
  const local: Session = {
    id: 's1',
    bookId: 'b1',
    timestamp: 200,
    durationSeconds: 10,
    wordsRead: 100,
    averageWpm: 300,
  };
  const cloudOlder: Session = { ...local, timestamp: 150 };
  assert.equal(resolveSessionConflict(local, cloudOlder).winner, 'local');
  assert.equal(resolveSessionConflict(cloudOlder, local).winner, 'cloud');
});
