import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSubmissions, saveSubmission } from '../src/lib/feedback.js';

test('saveSubmission persists the topic with the feedback', () => {
  const originalStorage = globalThis.localStorage;
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };

  try {
    const submissions = saveSubmission('Ada', 'Looks good', 'Code review');

    assert.equal(submissions[0].topic, 'Code review');
    assert.deepEqual(loadSubmissions(), submissions);
  } finally {
    if (originalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalStorage;
    }
  }
});
