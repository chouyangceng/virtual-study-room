'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadServiceWorker({ cacheKeys = [], fetchImpl } = {}) {
  const handlers = {};
  const deleted = [];
  const puts = [];
  const matches = [];
  const cache = {
    addAll: async () => {},
    put: async (key, value) => puts.push({ key, value })
  };
  const caches = {
    open: async () => cache,
    keys: async () => cacheKeys,
    delete: async key => { deleted.push(key); return true; },
    match: async key => { matches.push(key); return null; }
  };
  const self = {
    location: { origin: 'http://127.0.0.1:49173' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (name, handler) => { handlers[name] = handler; }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchImpl || (async () => { throw new Error('offline'); }),
    URL,
    Promise
  });
  return { handlers, deleted, puts, matches };
}

test('activation removes only stale virtual-study-room caches', async () => {
  const worker = loadServiceWorker({
    cacheKeys: ['virtual-study-room-v20', 'virtual-study-room-v22', 'virtual-study-room-v23', 'virtual-study-room-v24', 'mistake-notebook-v1']
  });
  let activation;
  worker.handlers.activate({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(worker.deleted, ['virtual-study-room-v20', 'virtual-study-room-v22', 'virtual-study-room-v23']);
});

test('navigation caches its own URL without replacing the offline home page', async () => {
  const response = { ok: true, clone: () => ({ cloned: true }) };
  const worker = loadServiceWorker({ fetchImpl: async () => response });
  const request = {
    method: 'GET',
    mode: 'navigate',
    url: 'http://127.0.0.1:49173/virtual-study-room.html'
  };
  let navigation;
  worker.handlers.fetch({ request, respondWith: promise => { navigation = promise; } });
  assert.equal(await navigation, response);
  assert.equal(worker.puts.length, 1);
  assert.equal(worker.puts[0].key, request);
  assert.equal(worker.puts.some(entry => entry.key === './index.html'), false);
});

test('offline navigation checks the requested page before the home fallback', async () => {
  const worker = loadServiceWorker();
  const request = {
    method: 'GET',
    mode: 'navigate',
    url: 'http://127.0.0.1:49173/virtual-study-room.html'
  };
  let navigation;
  worker.handlers.fetch({ request, respondWith: promise => { navigation = promise; } });
  await navigation;
  assert.deepEqual(worker.matches, [request, './index.html']);
});
