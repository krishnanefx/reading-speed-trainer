import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSyncQueue, getSyncRetryDelayMs } from '../../src/utils/db/syncQueue.js';
import type { SyncItem } from '../../src/utils/db/models.js';

const mk = (partial: Partial<SyncItem>): SyncItem => ({
  type: 'SYNC_BOOK',
  payload: { id: 'b1', title: 'T', content: 'c', progress: 0, totalWords: 1 },
  timestamp: 0,
  ...partial,
});

test('dedupeSyncQueue keeps latest item per key', () => {
  const queue: SyncItem[] = [
    mk({ id: 1, key: 'SYNC_BOOK:b1', timestamp: 100, retryAttempts: 1 }),
    mk({ id: 2, key: 'SYNC_BOOK:b1', timestamp: 200, retryAttempts: 0 }),
    mk({ id: 3, key: 'SYNC_BOOK:b2', payload: { id: 'b2', title: 'T2', content: 'c', progress: 0, totalWords: 1 }, timestamp: 150 }),
  ];

  const deduped = dedupeSyncQueue(queue);
  assert.equal(deduped.length, 2);
  assert.equal(deduped.find((item) => item.key === 'SYNC_BOOK:b1')?.id, 2);
  assert.equal(deduped[0]?.timestamp, 150);
  assert.equal(deduped[1]?.timestamp, 200);
});

test('getSyncRetryDelayMs uses exponential backoff with cap', () => {
  const base = 5000;
  assert.equal(getSyncRetryDelayMs(1, base), 5000);
  assert.equal(getSyncRetryDelayMs(2, base), 10000);
  assert.equal(getSyncRetryDelayMs(3, base), 20000);
  assert.equal(getSyncRetryDelayMs(10, base), 60000);
});
