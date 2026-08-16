'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { validateSnapshot, mergeArchiveAppData } = require('../shared/archive-core');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function ensureDirectory(directory) {
  await fs.promises.mkdir(directory, { recursive: true });
}

async function writeAtomic(filePath, data) {
  await ensureDirectory(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const handle = await fs.promises.open(tempPath, 'wx');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(tempPath, filePath);
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

class ArchiveStore {
  constructor(dataDirectory) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.archiveDirectory = path.join(this.dataDirectory, 'archives');
    this.configPath = path.join(this.dataDirectory, 'service-config.json');
    this.deviceQueues = new Map();
  }

  async init() {
    await ensureDirectory(this.archiveDirectory);
    let config;
    try {
      config = JSON.parse(await fs.promises.readFile(this.configPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!config || typeof config.token !== 'string' || config.token.length < 32) {
      config = { token: crypto.randomBytes(32).toString('base64url'), createdAt: new Date().toISOString() };
      await writeAtomic(this.configPath, `${JSON.stringify(config, null, 2)}\n`);
    }
    this.token = config.token;
    return config;
  }

  deviceDirectory(deviceId) {
    return path.join(this.archiveDirectory, safeSegment(deviceId));
  }

  indexPath(deviceId) {
    return path.join(this.deviceDirectory(deviceId), 'index.json');
  }

  async readIndex(deviceId) {
    try {
      const value = JSON.parse(await fs.promises.readFile(this.indexPath(deviceId), 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveSnapshot(rawBody, snapshot) {
    const validation = validateSnapshot(snapshot, { allowOlder: false });
    if (!validation.ok) throw Object.assign(new Error(validation.error), { statusCode: 422 });
    const deviceId = snapshot.device.id;
    const previous = this.deviceQueues.get(deviceId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => this.saveSnapshotLocked(rawBody, snapshot));
    this.deviceQueues.set(deviceId, operation);
    try {
      return await operation;
    } finally {
      if (this.deviceQueues.get(deviceId) === operation) this.deviceQueues.delete(deviceId);
    }
  }

  async saveSnapshotLocked(rawBody, snapshot) {
    const deviceId = snapshot.device.id;
    const hash = sha256(rawBody);
    const storedAt = new Date().toISOString();
    const archiveId = `${storedAt.replace(/[:.]/g, '-')}-${hash.slice(0, 16)}-${crypto.randomBytes(4).toString('hex')}`;
    const fileName = `${archiveId}.json`;
    const filePath = path.join(this.deviceDirectory(deviceId), fileName);
    await writeAtomic(filePath, rawBody);
    const persisted = await fs.promises.readFile(filePath);
    const persistedHash = sha256(persisted);
    if (persistedHash !== hash) throw new Error('落盘校验失败');
    const receipt = {
      durable: true,
      archiveId,
      deviceId,
      deviceName: snapshot.device.name,
      schemaVersion: snapshot.schemaVersion,
      createdAt: snapshot.createdAt,
      storedAt,
      sha256: hash,
      bytes: rawBody.length
    };
    const index = await this.readIndex(deviceId);
    index.unshift(receipt);
    await writeAtomic(this.indexPath(deviceId), `${JSON.stringify(index, null, 2)}\n`);
    return receipt;
  }

  async listSnapshots() {
    let entries = [];
    try {
      entries = await fs.promises.readdir(this.archiveDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const all = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      all.push(...await this.readIndex(entry.name));
    }
    return all.sort((left, right) => String(right.storedAt).localeCompare(String(left.storedAt)));
  }

  async readSnapshot(deviceId, archiveId) {
    if (safeSegment(deviceId) !== deviceId || safeSegment(archiveId) !== archiveId) return null;
    const index = await this.readIndex(deviceId);
    const receipt = index.find(item => item.archiveId === archiveId);
    if (!receipt) return null;
    const filePath = path.join(this.deviceDirectory(deviceId), `${archiveId}.json`);
    const body = await fs.promises.readFile(filePath);
    if (sha256(body) !== receipt.sha256) throw new Error('归档哈希校验失败');
    return { receipt, body };
  }

  async aggregateLatest() {
    const snapshots = await this.listSnapshots();
    const entries = [];
    for (const receipt of snapshots) {
      const found = await this.readSnapshot(receipt.deviceId, receipt.archiveId);
      if (!found) continue;
      entries.push({ receipt, snapshot: JSON.parse(found.body.toString('utf8')) });
    }
    return { generatedAt: new Date().toISOString(), ...mergeArchiveAppData(entries) };
  }
}

module.exports = { ArchiveStore, sha256, writeAtomic };
