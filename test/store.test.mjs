import test from 'node:test';
import assert from 'node:assert/strict';

const CURRENT = 'cornhole.project.v2', LEGACY = 'cornhole.design.v1';
const EARLIER = '2026-10-13T10:00:00.000Z', LATER = '2026-10-13T11:00:00.000Z';
const project = (words, savedAt = EARLIER) => ({ version: 3, savedAt, design: { a: { elements: [{ type: 'text', text: words }] }, b: { elements: [] } }, order: { quantity: 1 } });
let instance = 0;

/* Node has no IndexedDB. These browser-boundary doubles keep transactions
   asynchronous and clone records, while the real store module decides
   where to save, how to recover failures, and which draft to restore. */
async function storage(t, { current = null, fallback = null, legacy = null } = {}) {
  const state = { current, readError: null, writeError: null, localReadError: null, localWriteError: null, localRemoveError: null };
  const local = new Map();
  if (fallback) local.set(CURRENT, JSON.stringify(fallback));
  if (legacy) local.set(LEGACY, JSON.stringify(legacy));
  const db = {
    close() {},
    transaction(store, mode) {
      assert.equal(store, 'project');
      if (mode === 'readonly' && state.readError) throw state.readError;
      if (mode === 'readwrite' && state.writeError) throw state.writeError;
      const transaction = {
        objectStore(name) {
          assert.equal(name, 'project');
          return {
            get(key) { assert.equal(key, 'current'); return { result: structuredClone(state.current) }; },
            put(value, key) { assert.equal(key, 'current'); state.current = structuredClone(value); return {}; },
            delete(key) { assert.equal(key, 'current'); state.current = null; return {}; },
          };
        },
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
  };
  const globals = {
    indexedDB: { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request; } },
    localStorage: {
      getItem(key) { if (state.localReadError) throw state.localReadError; return local.get(key) ?? null; },
      setItem(key, value) { if (state.localWriteError) throw state.localWriteError; local.set(key, value); },
      removeItem(key) { if (state.localRemoveError) throw state.localRemoveError; local.delete(key); },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  }
  return { state, local, ...(await import('../lib/store.mjs?test=' + instance++)) };
}

test('a newer fallback save is restored even while the older IndexedDB copy remains readable', async (t) => {
  const store = await storage(t);
  await store.saveProject(project('BEFORE'));
  store.state.writeError = new Error('IndexedDB cannot write');
  const newer = project('AFTER', LATER);
  assert.equal(await store.saveProject(newer), 'localstorage');
  assert.deepEqual(await store.loadProject(), newer);
});

test('equal timestamps retain the fallback edit, then retain a successful save after IndexedDB recovers', async (t) => {
  const store = await storage(t, { current: project('BEFORE') });
  store.state.writeError = new Error('IndexedDB cannot write');
  await store.saveProject(project('FALLBACK'));
  assert.equal((await store.loadProject()).design.a.elements[0].text, 'FALLBACK');
  store.state.writeError = null;
  await store.saveProject(project('RECOVERED'));
  assert.equal((await store.loadProject()).design.a.elements[0].text, 'RECOVERED');
});

for (const [label, idbDate, fallbackDate, expected] of [
  ['newer IndexedDB', LATER, EARLIER, 'INDEXEDDB'],
  ['invalid IndexedDB date', 'not a date', LATER, 'FALLBACK'],
  ['missing IndexedDB date', undefined, LATER, 'FALLBACK'],
  ['invalid fallback date', LATER, 'not a date', 'INDEXEDDB'],
  ['both dates invalid', 'invalid', 'invalid', 'INDEXEDDB'],
  ['both dates missing', undefined, undefined, 'INDEXEDDB'],
]) {
  test('draft selection handles ' + label, async (t) => {
    const current = { ...project('INDEXEDDB'), savedAt: idbDate };
    const fallback = { ...project('FALLBACK'), savedAt: fallbackDate };
    const store = await storage(t, { current, fallback });
    assert.equal((await store.loadProject()).design.a.elements[0].text, expected);
  });
}

test('a successful IndexedDB save does not discard a newer fallback draft', async (t) => {
  const store = await storage(t, { fallback: project('NEWER FALLBACK', LATER) });
  await store.saveProject(project('OLDER INDEXEDDB', EARLIER));
  assert.equal((await store.loadProject()).design.a.elements[0].text, 'NEWER FALLBACK');
});

test('a failed IndexedDB read still restores the fallback', async (t) => {
  const fallback = project('FALLBACK');
  const store = await storage(t, { current: project('INDEXEDDB'), fallback });
  store.state.readError = new Error('IndexedDB cannot read');
  assert.deepEqual(await store.loadProject(), fallback);
});

test('unreadable localStorage does not prevent an IndexedDB restore', async (t) => {
  const current = project('INDEXEDDB');
  const store = await storage(t, { current });
  store.state.localReadError = new Error('localStorage cannot read');
  assert.deepEqual(await store.loadProject(), current);
});

test('fallback cleanup failure does not turn a successful IndexedDB save into a failed save', async (t) => {
  const store = await storage(t, { fallback: project('OLD') });
  store.state.localRemoveError = new Error('localStorage cannot remove');
  assert.equal(await store.saveProject(project('NEW', LATER)), 'indexeddb');
  assert.equal((await store.loadProject()).design.a.elements[0].text, 'NEW');
});

test('failure of both storage writes rejects with both errors and preserves the previous draft', async (t) => {
  const previous = project('PREVIOUS');
  const store = await storage(t, { current: previous });
  store.state.writeError = new Error('IndexedDB cannot write');
  store.state.localWriteError = new Error('localStorage cannot write');
  await assert.rejects(store.saveProject(project('UNSAVED', LATER)), (error) => {
    assert.equal(error.first, store.state.writeError);
    assert.equal(error.cause, store.state.localWriteError);
    return true;
  });
  assert.deepEqual(await store.loadProject(), previous);
});

test('legacy designs still restore when current stores have no valid project', async (t) => {
  const legacy = { a: { elements: [] }, b: { elements: [] } };
  const store = await storage(t, { current: { invalid: true }, fallback: { invalid: true }, legacy });
  assert.deepEqual(await store.loadProject(), { version: 1, design: legacy, order: null });
});

test('forgetting a project removes current, fallback, and legacy drafts', async (t) => {
  const store = await storage(t, { current: project('CURRENT'), fallback: project('FALLBACK'), legacy: project('LEGACY').design });
  await store.forgetProject();
  assert.equal(await store.loadProject(), null);
});
