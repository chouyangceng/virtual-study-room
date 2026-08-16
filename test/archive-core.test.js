'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Core = require('../shared/archive-core');

const validReceipt = sha256 => ({ durable: true, sha256 });
const hash = crypto.createHash('sha256').update('snapshot').digest('hex');

test('snapshot creation recursively removes credentials and sync secrets', () => {
  const snapshot = Core.createSnapshot({
    deviceId: 'device-12345678',
    deviceName: '平板',
    createdAt: '2026-08-12T00:00:00.000Z',
    appData: {
      focusSessions: [],
      syncSettings: { token: 'sync-secret' },
      deepseekSettings: {
        model: 'deepseek-chat',
        apiKey: 'top-secret',
        headers: { Authorization: 'Bearer secret', Accept: 'application/json' }
      }
    }
  });
  assert.equal(snapshot.appData.syncSettings, undefined);
  assert.equal(snapshot.appData.deepseekSettings.apiKey, undefined);
  assert.equal(snapshot.appData.deepseekSettings.headers.Authorization, undefined);
  assert.equal(snapshot.appData.deepseekSettings.headers.Accept, 'application/json');
});

test('server validation rejects unsupported fields, secrets, invalid id and future schema', () => {
  const base = Core.createSnapshot({ deviceId: 'device-12345678', deviceName: 'Mac', appData: { focusSessions: [] } });
  assert.equal(Core.validateSnapshot(base, { allowOlder: false }).ok, true);
  assert.equal(Core.validateSnapshot({ ...base, device: { id: '../bad', name: 'bad' } }).ok, false);
  assert.equal(Core.validateSnapshot({ ...base, schemaVersion: 999 }).ok, false);
  assert.equal(Core.validateSnapshot({ ...base, appData: { ...base.appData, syncToken: 'secret' } }).ok, false);
  assert.equal(Core.validateSnapshot({ ...base, appData: { deepseekSettings: { apiKey: 'secret' } } }).ok, false);
});

test('cleanup does nothing without a durable receipt bound to the uploaded hash', () => {
  const old = { id: 'old', date: '2026-01-01', duration: 25 };
  const current = { focusSessions: [old], tasks: [{ id: 'active', completed: false }] };
  const archived = { focusSessions: [old] };
  for (const options of [
    { retentionDays: 30, now: '2026-08-12' },
    { retentionDays: 30, now: '2026-08-12', receipt: { durable: false, sha256: hash }, expectedSha256: hash },
    { retentionDays: 30, now: '2026-08-12', receipt: validReceipt('f'.repeat(64)), expectedSha256: hash }
  ]) {
    const result = Core.cleanArchivedHistory(current, archived, options);
    assert.equal(result.cleanupAuthorized, false);
    assert.deepEqual(result.appData.focusSessions, [old]);
    assert.equal(result.totalRemoved, 0);
  }
});

test('cleanup removes only exact archived old records and retains edits, new data and active state', () => {
  const archivedOld = { id: 'old-1', date: '2026-01-01', duration: 25, note: 'original' };
  const editedOld = { id: 'old-2', date: '2026-01-02', duration: 25, note: 'edited after upload' };
  const archiveBeforeEdit = { ...editedOld, note: 'before upload' };
  const recent = { id: 'recent', date: '2026-08-10', duration: 50 };
  const current = {
    focusSessions: [archivedOld, editedOld, recent],
    dailyReviews: [{ id: 'r1', date: '2026-01-01', text: 'done' }],
    dailyCloseEntries: [{ id: 'c1', date: '2026-01-01', text: 'close' }],
    tasks: [{ id: 'active', completed: false }],
    studyPlans: [{ id: 'plan', completed: false }],
    focusActivity: {
      '2026-01-01': { attempts: 1, interruptions: 1 },
      '2026-08-10': { attempts: 2, interruptions: 1 }
    }
  };
  const archived = {
    focusSessions: [archivedOld, archiveBeforeEdit, recent],
    dailyReviews: current.dailyReviews,
    dailyCloseEntries: current.dailyCloseEntries,
    focusActivity: current.focusActivity
  };
  const result = Core.cleanArchivedHistory(current, archived, {
    retentionDays: 30,
    now: '2026-08-12T12:00:00Z',
    receipt: validReceipt(hash),
    expectedSha256: hash
  });
  assert.equal(result.cleanupAuthorized, true);
  assert.deepEqual(result.appData.focusSessions, [editedOld, recent]);
  assert.deepEqual(result.appData.dailyReviews, []);
  assert.deepEqual(result.appData.dailyCloseEntries, []);
  assert.deepEqual(result.appData.tasks, current.tasks);
  assert.deepEqual(result.appData.studyPlans, current.studyPlans);
  assert.equal(result.appData.focusActivity['2026-08-10'].attempts, 2);
  assert.equal(result.totalRemoved, 3);
});

test('cleanup treats duplicate records as a counted intersection', () => {
  const duplicate = { date: '2026-01-01', duration: 25 };
  const result = Core.cleanArchivedHistory(
    { focusSessions: [duplicate, duplicate] },
    { focusSessions: [duplicate] },
    { retentionDays: 30, now: '2026-08-12', receipt: validReceipt(hash), expectedSha256: hash }
  );
  assert.equal(result.appData.focusSessions.length, 1);
  assert.equal(result.totalRemoved, 1);
});

test('SHA-256 fallback matches the platform implementation', () => {
  for (const value of ['', 'abc', '虚拟自习室', JSON.stringify({ a: 1, b: [2, 3] })]) {
    const expected = crypto.createHash('sha256').update(value).digest('hex');
    assert.equal(Core.sha256Hex(value), expected);
  }
});

test('deleting a session reconciles reviews, day-close snapshots, daily totals and task counters', () => {
  const session = { id: 'session-1', taskId: 'task-1', date: '2026-08-16', duration: 25, timestamp: 100 };
  const kept = { id: 'session-2', taskId: 'task-1', date: '2026-08-16', duration: 10, timestamp: 200 };
  const result = Core.removeSessionRecords({
    focusSessions: [session, kept],
    sessionReviews: [{ id: 'review-1', sessionId: 'session-1' }, { id: 'review-2', sessionId: 'session-2' }],
    dailyCloseEntries: [{
      date: '2026-08-16', focusMinutes: 35,
      sessionsSnapshot: [session, kept],
      sessionReviewsSnapshot: [{ sessionId: 'session-1' }, { sessionId: 'session-2' }]
    }],
    dailyData: { date: '2026-08-16', minutes: 35 },
    tasks: [{ id: 'task-1', completedPomodoros: 2, focusMinutes: 35, lastFocusedAt: 200 }],
    focusActivity: { '2026-08-16': { attempts: 2, interruptions: 0, sessions: 2, minutes: 35 } }
  }, ['session-1']);
  assert.deepEqual(result.appData.focusSessions, [kept]);
  assert.deepEqual(result.appData.sessionReviews.map(item => item.id), ['review-2']);
  assert.deepEqual(result.appData.dailyCloseEntries[0].sessionsSnapshot, [kept]);
  assert.equal(result.appData.dailyCloseEntries[0].focusMinutes, 10);
  assert.equal(result.appData.dailyData.minutes, 10);
  assert.equal(result.appData.tasks[0].completedPomodoros, 1);
  assert.equal(result.appData.tasks[0].focusMinutes, 10);
  assert.equal(result.appData.tasks[0].lastFocusedAt, 200);
  assert.equal(result.appData.focusActivity['2026-08-16'].sessions, 1);
  assert.equal(result.appData.focusActivity['2026-08-16'].minutes, 10);
});

test('clearing sessions also removes orphan reviews and historical session snapshots', () => {
  const result = Core.removeSessionRecords({
    focusSessions: [],
    sessionReviews: [{ id: 'orphan', sessionId: 'missing' }],
    dailyCloseEntries: [{ date: '2026-08-15', focusMinutes: 25, sessionsSnapshot: [{ id: 'old', duration: 25 }], sessionReviewsSnapshot: [{ sessionId: 'old' }] }]
  }, [], { clearAll: true });
  assert.deepEqual(result.appData.sessionReviews, []);
  assert.deepEqual(result.appData.dailyCloseEntries[0].sessionsSnapshot, []);
  assert.deepEqual(result.appData.dailyCloseEntries[0].sessionReviewsSnapshot, []);
  assert.equal(result.appData.dailyCloseEntries[0].focusMinutes, 0);
});
