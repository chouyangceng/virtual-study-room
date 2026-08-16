(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VsrArchiveCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SNAPSHOT_SCHEMA_VERSION = 3;
  const SNAPSHOT_KIND = 'virtual-study-room-archive';
  const DEVICE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/;
  const ARCHIVE_KEYS = [
    'focusSessions', 'focusActivity', 'studyPlans', 'tasks', 'timerSettings',
    'courses', 'studyGoals', 'dailyReviews', 'sessionReviews', 'dailyCloseEntries', 'weeklyReports',
    'dailyData', 'appSettings', 'deepseekSettings',
    'currentStudyGoal', 'dayClosePromptedDate'
  ];
  const HISTORY_KEYS = ['focusSessions', 'dailyReviews', 'sessionReviews', 'dailyCloseEntries'];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function sanitizeDeepseekSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const sanitizeValue = entry => {
      if (Array.isArray(entry)) return entry.map(sanitizeValue);
      if (!entry || typeof entry !== 'object') return clone(entry);
      return Object.fromEntries(Object.entries(entry)
        .filter(([key]) => !/(?:api[-_]?key|token|authorization|password|secret|credential)/i.test(key))
        .map(([key, child]) => [key, sanitizeValue(child)]));
    };
    return sanitizeValue(value);
  }

  function sanitizeAppData(input) {
    const source = input && typeof input === 'object' ? input : {};
    const output = {};
    ARCHIVE_KEYS.forEach(key => {
      if (source[key] !== undefined) output[key] = clone(source[key]);
    });
    output.deepseekSettings = sanitizeDeepseekSettings(source.deepseekSettings);
    delete output.syncSettings;
    delete output.syncToken;
    return output;
  }

  function createSnapshot(options) {
    const deviceId = String(options && options.deviceId || '').trim();
    if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error('deviceId 格式无效');
    const deviceName = String(options && options.deviceName || '').trim().slice(0, 80) || '未命名设备';
    const createdAt = options && options.createdAt ? new Date(options.createdAt) : new Date();
    if (Number.isNaN(createdAt.getTime())) throw new Error('createdAt 无效');
    return {
      kind: SNAPSHOT_KIND,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      device: { id: deviceId, name: deviceName },
      createdAt: createdAt.toISOString(),
      appData: sanitizeAppData(options && options.appData)
    };
  }

  function validateSnapshot(snapshot, options) {
    const allowOlder = !options || options.allowOlder !== false;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ok: false, error: '快照必须是对象' };
    if (snapshot.kind !== SNAPSHOT_KIND) return { ok: false, error: '快照类型无效' };
    const schemaVersion = Number(snapshot.schemaVersion);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) return { ok: false, error: 'schemaVersion 无效' };
    if (schemaVersion > SNAPSHOT_SCHEMA_VERSION) return { ok: false, error: '快照 schemaVersion 高于当前客户端' };
    if (!allowOlder && schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return { ok: false, error: '服务端仅接受当前 schemaVersion' };
    if (!snapshot.device || !DEVICE_ID_PATTERN.test(String(snapshot.device.id || ''))) return { ok: false, error: 'deviceId 无效' };
    if (typeof snapshot.device.name !== 'string' || snapshot.device.name.length > 80) return { ok: false, error: '设备名称无效' };
    if (!snapshot.createdAt || Number.isNaN(Date.parse(snapshot.createdAt))) return { ok: false, error: 'createdAt 无效' };
    if (!snapshot.appData || typeof snapshot.appData !== 'object' || Array.isArray(snapshot.appData)) return { ok: false, error: 'appData 无效' };
    if (stableStringify(snapshot.appData) !== stableStringify(sanitizeAppData(snapshot.appData))) {
      return { ok: false, error: 'appData 含不支持字段或敏感凭据' };
    }
    return { ok: true };
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  // Synchronous SHA-256 fallback for LAN HTTP origins where Web Crypto is not
  // exposed as a secure-context API. Input is UTF-8 text and output is hex.
  function sha256Hex(input) {
    const bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(String(input))
      : unescape(encodeURIComponent(String(input))).split('').map(char => char.charCodeAt(0));
    const words = [];
    for (let index = 0; index < bytes.length; index += 1) words[index >> 2] = (words[index >> 2] || 0) | bytes[index] << (24 - (index % 4) * 8);
    const bitLength = bytes.length * 8;
    words[bitLength >> 5] = (words[bitLength >> 5] || 0) | 0x80 << (24 - bitLength % 32);
    words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;
    const constants = [];
    const initial = [];
    let candidate = 2;
    while (constants.length < 64) {
      let prime = true;
      for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) {
        if (candidate % divisor === 0) { prime = false; break; }
      }
      if (prime) {
        if (initial.length < 8) initial.push((Math.sqrt(candidate) * 0x100000000) | 0);
        constants.push((Math.cbrt(candidate) * 0x100000000) | 0);
      }
      candidate += 1;
    }
    const hash = initial.slice();
    const schedule = new Array(64);
    const rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
    for (let offset = 0; offset < words.length; offset += 16) {
      const previous = hash.slice();
      for (let round = 0; round < 64; round += 1) {
        if (round < 16) schedule[round] = words[offset + round] | 0;
        else {
          const x = schedule[round - 15];
          const y = schedule[round - 2];
          const sigma0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3);
          const sigma1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10);
          schedule[round] = (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) | 0;
        }
        const e = previous[4];
        const a = previous[0];
        const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
        const choice = (e & previous[5]) ^ (~e & previous[6]);
        const temp1 = (previous[7] + sum1 + choice + constants[round] + schedule[round]) | 0;
        const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
        const majority = (a & previous[1]) ^ (a & previous[2]) ^ (previous[1] & previous[2]);
        const temp2 = (sum0 + majority) | 0;
        previous.pop();
        previous.unshift((temp1 + temp2) | 0);
        previous[4] = (previous[4] + temp1) | 0;
      }
      for (let index = 0; index < 8; index += 1) hash[index] = (hash[index] + previous[index]) | 0;
    }
    return hash.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function recordIdentity(record) {
    if (!record || typeof record !== 'object') return '';
    if (record.id !== undefined && record.id !== null && String(record.id)) return `id:${String(record.id)}`;
    return `value:${stableStringify(record)}`;
  }

  function recordDate(record) {
    if (!record || typeof record !== 'object') return null;
    const candidates = [record.date, record.reviewDate, record.createdAt, record.timestamp, record.startedAt];
    for (const value of candidates) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return localDateString(date);
      }
    }
    return null;
  }

  function mergeArchiveAppData(entries) {
    const sources = Array.isArray(entries) ? entries : [];
    const arrayKeys = ['focusSessions', 'dailyReviews', 'sessionReviews', 'dailyCloseEntries', 'weeklyReports'];
    const maps = Object.fromEntries(arrayKeys.map(key => [key, new Map()]));
    const devices = new Map();
    sources
      .filter(entry => entry && entry.snapshot && validateSnapshot(entry.snapshot, { allowOlder: true }).ok)
      .sort((left, right) => String(left.snapshot.createdAt).localeCompare(String(right.snapshot.createdAt)))
      .forEach(entry => {
        const snapshot = entry.snapshot;
        const device = {
          id: snapshot.device.id,
          name: snapshot.device.name,
          createdAt: snapshot.createdAt,
          storedAt: entry.receipt && entry.receipt.storedAt || snapshot.createdAt,
        };
        devices.set(device.id, device);
        const appData = sanitizeAppData(snapshot.appData);
        arrayKeys.forEach(key => {
          const records = Array.isArray(appData[key]) ? appData[key] : [];
          records.forEach(record => {
            if (!record || typeof record !== 'object') return;
            const identity = recordIdentity(record);
            if (!identity) return;
            maps[key].set(identity, {
              ...clone(record),
              _archiveDeviceId: device.id,
              _archiveDeviceName: device.name,
            });
          });
        });
      });
    const appData = {};
    arrayKeys.forEach(key => {
      appData[key] = [...maps[key].values()].sort((left, right) => {
        const dateOrder = String(recordDate(left) || '').localeCompare(String(recordDate(right) || ''));
        if (dateOrder) return dateOrder;
        return (Number(left.startedAt) || Number(left.timestamp) || Number(left.createdAt) || 0)
          - (Number(right.startedAt) || Number(right.timestamp) || Number(right.createdAt) || 0);
      });
    });
    return { devices: [...devices.values()], appData };
  }

  function isOlderThan(dateString, cutoffDate) {
    if (!dateString) return false;
    return dateString < cutoffDate;
  }

  function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function cleanArchivedHistory(currentAppData, archivedAppData, options) {
    const current = sanitizeAppData(currentAppData);
    const archived = sanitizeAppData(archivedAppData);
    const receipt = options && options.receipt;
    const expectedSha256 = String(options && options.expectedSha256 || '').toLowerCase();
    const cleanupAuthorized = Boolean(receipt
      && receipt.durable === true
      && /^[a-f0-9]{64}$/.test(expectedSha256)
      && String(receipt.sha256 || '').toLowerCase() === expectedSha256);
    const now = options && options.now ? new Date(options.now) : new Date();
    const retentionDays = Math.max(1, Number(options && options.retentionDays) || 30);
    const cutoff = localDateString(new Date(now.getTime() - retentionDays * 86400000));
    const result = clone(current);
    const counts = Object.fromEntries(HISTORY_KEYS.map(key => [key, 0]));

    if (!cleanupAuthorized) {
      return { appData: result, counts, totalRemoved: 0, cutoffDate: cutoff, cleanupAuthorized: false };
    }

    HISTORY_KEYS.forEach(key => {
      const currentRecords = Array.isArray(current[key]) ? current[key] : [];
      const archivedRecords = Array.isArray(archived[key]) ? archived[key] : [];
      const archivedCounts = new Map();
      archivedRecords.forEach(record => {
        const fingerprint = `${recordIdentity(record)}\u0000${stableStringify(record)}`;
        archivedCounts.set(fingerprint, (archivedCounts.get(fingerprint) || 0) + 1);
      });
      let removed = 0;
      result[key] = currentRecords.filter(record => {
        const fingerprint = `${recordIdentity(record)}\u0000${stableStringify(record)}`;
        const archivedCount = archivedCounts.get(fingerprint) || 0;
        const shouldRemove = isOlderThan(recordDate(record), cutoff)
          && archivedCount > 0;
        if (shouldRemove) {
          removed += 1;
          archivedCounts.set(fingerprint, archivedCount - 1);
        }
        return !shouldRemove;
      });
      counts[key] = removed;
    });

    const currentActivity = current.focusActivity && typeof current.focusActivity === 'object' && !Array.isArray(current.focusActivity)
      ? current.focusActivity : {};
    const archivedActivity = archived.focusActivity && typeof archived.focusActivity === 'object' && !Array.isArray(archived.focusActivity)
      ? archived.focusActivity : {};
    const focusActivity = {};
    Object.entries(currentActivity).forEach(([date, value]) => {
      const exactlyArchived = Object.prototype.hasOwnProperty.call(archivedActivity, date)
        && stableStringify(value) === stableStringify(archivedActivity[date]);
      if (!(date < cutoff && exactlyArchived)) focusActivity[date] = clone(value);
    });
    const remainingSessions = Array.isArray(result.focusSessions) ? result.focusSessions : [];
    remainingSessions.forEach(session => {
      const date = recordDate(session);
      if (!date) return;
      if (!focusActivity[date]) {
        focusActivity[date] = {
          attempts: Number(currentActivity[date] && currentActivity[date].attempts) || 0,
          interruptions: Number(currentActivity[date] && currentActivity[date].interruptions) || 0
        };
      }
      focusActivity[date].sessions = (Number(focusActivity[date].sessions) || 0) + 1;
      focusActivity[date].minutes = (Number(focusActivity[date].minutes) || 0) + Math.max(0, Number(session.duration) || 0);
    });
    result.focusActivity = focusActivity;
    if (result.dailyData && result.dailyData.date && result.dailyData.date < cutoff
      && stableStringify(result.dailyData) === stableStringify(archived.dailyData)) delete result.dailyData;

    return {
      appData: result,
      counts,
      totalRemoved: Object.values(counts).reduce((sum, count) => sum + count, 0),
      cutoffDate: cutoff,
      cleanupAuthorized: true
    };
  }

  function removeSessionRecords(appData, sessionIds, options) {
    const source = appData && typeof appData === 'object' ? clone(appData) : {};
    const clearAll = Boolean(options && options.clearAll);
    const requestedIds = new Set((Array.isArray(sessionIds) ? sessionIds : []).map(String).filter(Boolean));
    const sessions = Array.isArray(source.focusSessions) ? source.focusSessions : [];
    const shouldRemove = session => clearAll || requestedIds.has(String(session && session.id || ''));
    const removedSessions = sessions.filter(shouldRemove);
    const remainingSessions = sessions.filter(session => !shouldRemove(session));
    const removedIds = new Set(removedSessions.map(session => String(session && session.id || '')).filter(Boolean));
    requestedIds.forEach(id => removedIds.add(id));

    source.focusSessions = remainingSessions;
    const sessionReviews = Array.isArray(source.sessionReviews) ? source.sessionReviews : [];
    source.sessionReviews = clearAll
      ? []
      : sessionReviews.filter(review => !removedIds.has(String(review && review.sessionId || '')));

    const closes = Array.isArray(source.dailyCloseEntries) ? source.dailyCloseEntries : [];
    source.dailyCloseEntries = closes.map(entry => {
      if (!entry || typeof entry !== 'object') return entry;
      const next = { ...entry };
      if (Array.isArray(next.sessionsSnapshot)) {
        next.sessionsSnapshot = clearAll ? [] : next.sessionsSnapshot.filter(session => !removedIds.has(String(session && session.id || '')));
      }
      if (Array.isArray(next.sessionReviewsSnapshot)) {
        next.sessionReviewsSnapshot = clearAll ? [] : next.sessionReviewsSnapshot.filter(review => !removedIds.has(String(review && review.sessionId || '')));
      }
      if (clearAll || removedSessions.some(session => session && session.date === next.date)) {
        const records = Array.isArray(next.sessionsSnapshot)
          ? next.sessionsSnapshot
          : remainingSessions.filter(session => session && session.date === next.date);
        next.focusMinutes = records.reduce((sum, session) => sum + Math.max(0, Number(session && session.duration) || 0), 0);
        next.updatedAt = new Date().toISOString();
      }
      return next;
    });

    const removedByTask = new Map();
    removedSessions.forEach(session => {
      const taskId = String(session && session.taskId || '');
      if (!taskId) return;
      const current = removedByTask.get(taskId) || { count: 0, minutes: 0 };
      current.count += 1;
      current.minutes += Math.max(0, Number(session.duration) || 0);
      removedByTask.set(taskId, current);
    });
    if (Array.isArray(source.tasks) && (clearAll || removedByTask.size)) {
      source.tasks = source.tasks.map(task => {
        if (clearAll) return { ...task, completedPomodoros: 0, focusMinutes: 0, lastFocusedAt: null };
        const removed = removedByTask.get(String(task && task.id || ''));
        if (!removed) return task;
        const remainingForTask = remainingSessions.filter(session => String(session && session.taskId || '') === String(task.id));
        return {
          ...task,
          completedPomodoros: Math.max(0, (Number(task.completedPomodoros) || 0) - removed.count),
          focusMinutes: Math.max(0, (Number(task.focusMinutes) || 0) - removed.minutes),
          lastFocusedAt: remainingForTask.reduce((latest, session) => Math.max(latest, Number(session.timestamp) || Number(session.startedAt) || 0), 0) || null,
        };
      });
    }

    if (source.dailyData && typeof source.dailyData === 'object' && source.dailyData.date) {
      const date = source.dailyData.date;
      if (clearAll || removedSessions.some(session => session && session.date === date)) {
        source.dailyData = {
          ...source.dailyData,
          minutes: remainingSessions
            .filter(session => session && session.date === date && (session.type || 'work') === 'work')
            .reduce((sum, session) => sum + Math.max(0, Number(session.duration) || 0), 0),
        };
      }
    }

    if (source.focusActivity && typeof source.focusActivity === 'object' && !Array.isArray(source.focusActivity)) {
      const affectedDates = new Set(clearAll
        ? Object.keys(source.focusActivity)
        : removedSessions.map(session => session && session.date).filter(Boolean));
      affectedDates.forEach(date => {
        if (!source.focusActivity[date]) return;
        const records = remainingSessions.filter(session => session && session.date === date && (session.type || 'work') === 'work');
        const next = { ...source.focusActivity[date] };
        if (Object.prototype.hasOwnProperty.call(next, 'sessions')) next.sessions = records.length;
        if (Object.prototype.hasOwnProperty.call(next, 'minutes')) next.minutes = records.reduce((sum, session) => sum + Math.max(0, Number(session.duration) || 0), 0);
        source.focusActivity[date] = next;
      });
    }

    return {
      appData: source,
      removedSessions,
      removedSessionReviewCount: sessionReviews.length - source.sessionReviews.length,
    };
  }

  return {
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_KIND,
    DEVICE_ID_PATTERN,
    ARCHIVE_KEYS,
    HISTORY_KEYS,
    sanitizeAppData,
    createSnapshot,
    validateSnapshot,
    stableStringify,
    sha256Hex,
    recordIdentity,
    recordDate,
    cleanArchivedHistory,
    removeSessionRecords,
    mergeArchiveAppData
  };
});
