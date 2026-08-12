import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createArchiveServer } = require('../server/archive-server');
const { createSnapshot } = require('../shared/archive-core');
const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vsr-smoke-'));
const service = await createArchiveServer({ dataDirectory, staticRoot: path.resolve('.'), host: '127.0.0.1', port: 0 });
try {
  const address = await service.listen();
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/snapshots`)).status, 401);
  const snapshot = createSnapshot({ deviceId: 'device-smoke-test', deviceName: 'Smoke', appData: { focusSessions: [] } });
  const raw = JSON.stringify(snapshot);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const headers = { Authorization: `Bearer ${service.store.token}`, 'Content-Type': 'application/json' };
  const upload = await fetch(`${base}/api/v1/snapshots`, { method: 'POST', headers, body: raw });
  assert.equal(upload.status, 201);
  const receipt = (await upload.json()).receipt;
  assert.equal(receipt.sha256, sha256);
  const archivePath = path.join(dataDirectory, 'archives', receipt.deviceId, `${receipt.archiveId}.json`);
  assert.equal(await fs.readFile(archivePath, 'utf8'), raw);
  const download = await fetch(`${base}/api/v1/snapshots/${receipt.deviceId}/${receipt.archiveId}`, { headers });
  assert.equal(download.headers.get('x-archive-sha256'), sha256);
  assert.equal(await download.text(), raw);
  console.log(`archive smoke OK: ${base}, ${receipt.archiveId}, ${receipt.bytes} bytes`);
} finally {
  await service.close();
  await fs.rm(dataDirectory, { recursive: true, force: true });
}
