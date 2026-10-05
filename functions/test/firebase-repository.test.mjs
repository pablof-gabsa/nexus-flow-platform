import test from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseRepository } from '../src/firebase-repository.mjs';
import { NexusError } from '../src/validation.mjs';

// Model RTDB's cold cache: a transaction has no current value until its first
// value event. Keeping that listener alive retains the task during the write.
function coldDatabase(stored, { readError, writeError } = {}) {
  const listeners = new Set();
  const ref = {
    on(event, listener, cancel) {
      listeners.add(listener);
      queueMicrotask(() => readError ? cancel(readError) : listener({ val: () => stored }));
    },
    off(event, listener) { listeners.delete(listener); },
    async transaction(change) {
      if (writeError) throw writeError;
      const result = change(listeners.size ? structuredClone(stored) : null);
      if (result === undefined) return { committed: false };
      stored = result;
      return { committed: true, snapshot: { val: () => structuredClone(stored) } };
    }
  };
  return { ref: () => ref, listeners, value: () => stored };
}

test('cold task edits load the existing value and preserve unrelated data', async () => {
  const database = coldDatabase({ requerimiento: 'Existing task', attachments: [{ name: 'Keep' }] });
  const repo = new FirebaseRepository(database);
  const saved = await repo.taskTransaction('project', 'task', current => {
    if (!current) throw new NexusError(404, 'task_not_found', 'Missing');
    return { ...current, description: 'Edited' };
  });
  assert.equal(saved.description, 'Edited');
  assert.equal(saved.attachments[0].name, 'Keep');
  assert.equal(database.listeners.size, 0);
});

test('missing tasks and failed writes leave no active task subscription', async () => {
  for (const options of [{}, { readError: new Error('Read failed') }, { writeError: new Error('Write failed') }]) {
    const database = coldDatabase(null, options);
    const repo = new FirebaseRepository(database);
    await assert.rejects(repo.taskTransaction('project', 'task', current => {
      if (!current) throw new NexusError(404, 'task_not_found', 'Missing');
      return current;
    }));
    assert.equal(database.value(), null);
    assert.equal(database.listeners.size, 0);
  }
});
