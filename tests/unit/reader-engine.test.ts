import test from 'node:test';
import assert from 'node:assert/strict';
import { ReaderEngine } from '../../src/reader/ReaderEngine.js';

test('ReaderEngine scheduler advances and stops at end deterministically', () => {
  const originalWindow = (globalThis as { window?: typeof globalThis }).window;
  const originalPerformance = globalThis.performance;

  let now = 0;
  let timeoutId = 0;
  const fakeWindow = {
    setTimeout: (fn: () => void, ms?: number) => {
      timeoutId += 1;
      void ms;
      fn();
      return timeoutId;
    },
    clearTimeout: () => {},
  };

  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => (now += 120) },
    configurable: true,
    writable: true,
  });

  try {
    const engine = new ReaderEngine({ text: '', wpm: 600, chunkSize: 1 });
    engine.setWords(['one', 'two', 'three']);
    engine.setPlaying(true);

    const snapshot = engine.getSnapshot();
    assert.equal(snapshot.currentIndex, 2);
    assert.equal(snapshot.isPlaying, false);
    assert.equal(snapshot.currentDisplay, 'three');
  } finally {
    Object.defineProperty(globalThis, 'performance', {
      value: originalPerformance,
      configurable: true,
      writable: true,
    });
    if (originalWindow === undefined) {
      delete (globalThis as { window?: typeof globalThis }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  }
});
