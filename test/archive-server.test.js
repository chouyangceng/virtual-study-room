'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createArchiveServer } = require('../server/archive-server');
const { createSnapshot, SNAPSHOT_SCHEMA_VERSION } = require('../shared/archive-core');

async function fixture(options = {}) {
  const dataDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsr-test-'));
  const service = await createArchiveServer({
    dataDirectory,
    staticRoot: path.join(__dirname, '..'),
    host: '127.0.0.1',
    port: 0,
    ...options
  });
  const address = await service.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    service, dataDirectory, baseUrl,
    async close() {
      await service.close();
      await fs.promises.rm(dataDirectory, { recursive: true, force: true });
    }
  };
}

function snapshot() {
  return createSnapshot({
    deviceId: 'device-server-test',
    deviceName: '测试平板',
    createdAt: '2026-08-12T00:00:00.000Z',
    appData: { focusSessions: [{ id: 's1', date: '2026-08-11', duration: 25 }] }
  });
}

test('health is anonymous while snapshot APIs require a bearer token', async t => {
  const f = await fixture();
  t.after(() => f.close());
  assert.equal((await fetch(`${f.baseUrl}/api/v1/health`)).status, 200);
  assert.equal((await fetch(`${f.baseUrl}/api/v1/snapshots`)).status, 401);
  assert.equal((await fetch(`${f.baseUrl}/api/v1/aggregate`)).status, 401);
  assert.equal((await fetch(`${f.baseUrl}/api/v1/snapshots`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
});

test('authorized upload is atomically persisted, indexed and hash-verifiable on download', async t => {
  const f = await fixture();
  t.after(() => f.close());
  const raw = JSON.stringify(snapshot());
  const expectedHash = crypto.createHash('sha256').update(raw).digest('hex');
  const headers = { Authorization: `Bearer ${f.service.store.token}`, 'Content-Type': 'application/json' };
  const upload = await fetch(`${f.baseUrl}/api/v1/snapshots`, { method: 'POST', headers, body: raw });
  assert.equal(upload.status, 201);
  const receipt = (await upload.json()).receipt;
  assert.equal(receipt.durable, true);
  assert.equal(receipt.sha256, expectedHash);
  const archivePath = path.join(f.dataDirectory, 'archives', receipt.deviceId, `${receipt.archiveId}.json`);
  assert.equal(await fs.promises.readFile(archivePath, 'utf8'), raw);

  const listing = await fetch(`${f.baseUrl}/api/v1/snapshots`, { headers });
  const snapshots = (await listing.json()).snapshots;
  assert.equal(snapshots.length, 1);
  const download = await fetch(`${f.baseUrl}/api/v1/snapshots/${receipt.deviceId}/${receipt.archiveId}`, { headers });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-archive-sha256'), expectedHash);
  assert.equal(await download.text(), raw);
});

test('authenticated cross-origin clients can upload and Windows returns a durable cross-device aggregate', async t => {
  const f = await fixture();
  t.after(() => f.close());
  const token = `Bearer ${f.service.store.token}`;
  const origin = 'http://127.0.0.1:51234';
  const preflight = await fetch(`${f.baseUrl}/api/v1/snapshots`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

  const upload = async (deviceId, deviceName, createdAt, appData) => fetch(`${f.baseUrl}/api/v1/snapshots`, {
    method: 'POST',
    headers: { Origin: origin, Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(createSnapshot({ deviceId, deviceName, createdAt, appData }))
  });
  assert.equal((await upload('device-mac-test', 'Mac', '2026-08-16T01:00:00Z', {
    focusSessions: [{ id: 'mac-session-old', date: '2026-08-16', duration: 25 }]
  })).status, 201);
  assert.equal((await upload('device-mac-test', 'Mac', '2026-08-16T02:00:00Z', {
    focusSessions: [{ id: 'mac-session-new', date: '2026-08-16', duration: 50 }],
    sessionReviews: [{ id: 'mac-review', sessionId: 'mac-session-new', date: '2026-08-16', result: '完成章节' }]
  })).status, 201);
  assert.equal((await upload('device-pad-test', '平板', '2026-08-16T03:00:00Z', {
    dailyReviews: [{ id: 'pad-review', date: '2026-08-16', result: '整理错题' }]
  })).status, 201);

  const androidPreflight = await fetch(`${f.baseUrl}/api/v1/snapshots`, {
    method: 'OPTIONS',
    headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type', 'Access-Control-Request-Private-Network': 'true' }
  });
  assert.equal(androidPreflight.status, 204);
  assert.equal(androidPreflight.headers.get('access-control-allow-origin'), 'null');
  assert.equal(androidPreflight.headers.get('access-control-allow-private-network'), 'true');
  const androidSnapshot = createSnapshot({
    deviceId: 'device-android-test',
    deviceName: 'Android 自习室',
    createdAt: '2026-08-16T04:00:00Z',
    appData: {
      focusSessions: [{ id: 'android-session', date: '2026-08-16', duration: 18, categoryPath: '数学', endedEarly: true }],
      sessionReviews: [{ id: 'android-review', sessionId: 'android-session', date: '2026-08-16', result: '完成同步验证' }]
    }
  });
  const androidUpload = await fetch(`${f.baseUrl}/api/v1/snapshots`, {
    method: 'POST',
    headers: { Origin: 'null', Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(androidSnapshot)
  });
  assert.equal(androidUpload.status, 201);
  assert.equal(androidUpload.headers.get('access-control-allow-origin'), 'null');

  const response = await fetch(`${f.baseUrl}/api/v1/aggregate`, { headers: { Origin: origin, Authorization: token } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const aggregate = await response.json();
  assert.equal(aggregate.devices.length, 3);
  assert.deepEqual(aggregate.appData.focusSessions.map(item => item.id), ['mac-session-old', 'mac-session-new', 'android-session']);
  assert.equal(aggregate.appData.sessionReviews[0].result, '完成章节');
  assert.equal(aggregate.appData.dailyReviews[0].result, '整理错题');
  assert.equal(aggregate.appData.focusSessions[2].categoryPath, '数学');
  assert.equal(aggregate.appData.focusSessions[2].endedEarly, true);
  assert.equal(aggregate.appData.sessionReviews[1].result, '完成同步验证');
});

test('same-device concurrent uploads keep every immutable archive indexed', async t => {
  const f = await fixture();
  t.after(() => f.close());
  const headers = { Authorization: `Bearer ${f.service.store.token}`, 'Content-Type': 'application/json' };
  const bodies = [1, 2, 3, 4].map(index => JSON.stringify(createSnapshot({
    deviceId: 'device-concurrent',
    deviceName: '并发设备',
    createdAt: `2026-08-12T00:00:0${index}.000Z`,
    appData: { focusSessions: [{ id: `s${index}`, date: '2026-08-12', duration: 25 }] }
  })));
  const responses = await Promise.all(bodies.map(body => fetch(`${f.baseUrl}/api/v1/snapshots`, { method: 'POST', headers, body })));
  assert.deepEqual(responses.map(response => response.status), [201, 201, 201, 201]);
  const receipts = await Promise.all(responses.map(response => response.json().then(value => value.receipt)));
  assert.equal(new Set(receipts.map(receipt => receipt.archiveId)).size, 4);
  const listed = (await (await fetch(`${f.baseUrl}/api/v1/snapshots`, { headers })).json()).snapshots;
  assert.equal(listed.length, 4);
});

test('invalid device, future schema, secrets, malformed JSON and oversized bodies are rejected', async t => {
  const f = await fixture({ maxBodyBytes: 512 });
  t.after(() => f.close());
  const headers = { Authorization: `Bearer ${f.service.store.token}`, 'Content-Type': 'application/json' };
  const base = snapshot();
  const cases = [
    { ...base, device: { id: '../bad', name: 'bad' } },
    { ...base, schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 },
    { ...base, appData: { ...base.appData, syncToken: 'secret' } },
    { ...base, appData: { deepseekSettings: { apiKey: 'secret' } } }
  ];
  for (const value of cases) {
    const response = await fetch(`${f.baseUrl}/api/v1/snapshots`, { method: 'POST', headers, body: JSON.stringify(value) });
    assert.equal(response.status, 422);
  }
  assert.equal((await fetch(`${f.baseUrl}/api/v1/snapshots`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${f.baseUrl}/api/v1/snapshots`, { method: 'POST', headers, body: 'x'.repeat(600) })).status, 413);
});

test('local config is loopback-only and reports the actual ephemeral port', async t => {
  const local = await fixture();
  t.after(() => local.close());
  const response = await fetch(`${local.baseUrl}/api/v1/local-config`);
  assert.equal(response.status, 200);
  const config = await response.json();
  assert.equal(config.port, local.service.port);
  assert.equal(config.token, local.service.store.token);
  assert.equal(response.headers.get('access-control-allow-origin'), null);

  const nullOrigin = await fetch(`${local.baseUrl}/api/v1/local-config`, { headers: { Origin: 'null' } });
  assert.equal(nullOrigin.status, 200);
  assert.equal(nullOrigin.headers.get('access-control-allow-origin'), null);

  const remote = await fixture({ remoteAddressResolver: () => '192.168.1.20' });
  t.after(() => remote.close());
  assert.equal((await fetch(`${remote.baseUrl}/api/v1/local-config`)).status, 403);
});

test('static server blocks traversal and non-app files while serving the PWA shell', async t => {
  const f = await fixture();
  t.after(() => f.close());
  const index = await fetch(`${f.baseUrl}/index.html`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(index.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(`${f.baseUrl}/package.json`)).status, 404);
  assert.equal((await fetch(`${f.baseUrl}/server/archive-server.js`)).status, 404);
  const traversal = await fetch(`${f.baseUrl}/%252e%252e/package.json`);
  assert.equal(traversal.status, 403);
});
