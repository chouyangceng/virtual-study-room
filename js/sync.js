const SyncManager = {
  latestSchemaVersion: typeof VsrArchiveCore !== 'undefined' ? VsrArchiveCore.SNAPSHOT_SCHEMA_VERSION : 3,
  manualKeys: ['focusSessions', 'focusActivity', 'studyPlans', 'tasks', 'timerSettings', 'courses', 'studyGoals', 'dailyReviews', 'sessionReviews', 'dailyCloseEntries', 'weeklyReports', 'appSettings', 'deepseekSettings', 'currentStudyGoal', 'dayClosePromptedDate'],
  settingsKey: 'syncSettings',
  stateKey: 'syncState',
  inFlight: null,
  timer: null,
  backoffUntil: 0,
  failureCount: 0,
  archives: [],
  aggregate: null,
  localArchiveConfig: null,

  init() {
    const modal = document.getElementById('sync-modal');
    document.getElementById('btn-sync').addEventListener('click', () => this.open());
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    document.getElementById('btn-sync-export').addEventListener('click', () => Stats.exportData());
    document.getElementById('btn-sync-import').addEventListener('click', () => document.getElementById('sync-file-input').click());
    document.getElementById('sync-file-input').addEventListener('change', event => { if (event.target.files[0]) this.importFile(event.target.files[0]); event.target.value = ''; });
    document.getElementById('btn-sync-save').addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-sync-test').addEventListener('click', () => this.testConnection());
    document.getElementById('btn-sync-upload').addEventListener('click', () => this.uploadNow('manual'));
    document.getElementById('btn-sync-list').addEventListener('click', () => this.loadArchives());
    document.getElementById('sync-archive-list').addEventListener('click', event => this.handleArchiveAction(event));
    document.getElementById('sync-token-toggle').addEventListener('click', () => this.toggleToken());
    this.fillSettings();
    this.renderStatus();
    this.configureTimer();
    this.bootstrapLocalArchive();
    window.addEventListener('online', () => this.scheduleUpload('online', 800));
    window.addEventListener('offline', () => this.renderStatus('offline', '当前离线，计时与本地保存不受影响'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.scheduleUpload('foreground', 1000);
    });
    this.scheduleUpload('open', 1500);
  },

  networkSupported() {
    return location.protocol !== 'file:' || new URLSearchParams(location.search).get('electron') === '1';
  },

  defaultSettings() {
    return {
      serviceUrl: location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : '',
      token: '',
      deviceName: this.defaultDeviceName(),
      deviceId: this.getOrCreateDeviceId(),
      autoSync: true,
      intervalMinutes: 15,
      retentionDays: 30,
      autoCleanup: true
    };
  },

  defaultDeviceName() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '设备';
    return `${platform} 自习室`;
  },

  getOrCreateDeviceId() {
    let deviceId = SafeStore.get('syncDeviceId', '');
    if (VsrArchiveCore.DEVICE_ID_PATTERN.test(deviceId)) return deviceId;
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    deviceId = `device-${Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    SafeStore.set('syncDeviceId', deviceId);
    return deviceId;
  },

  getSettings() {
    let stored = {};
    try { stored = JSON.parse(SafeStore.get(this.settingsKey, '{}')) || {}; } catch (error) { stored = {}; }
    return { ...this.defaultSettings(), ...stored, deviceId: stored.deviceId || this.getOrCreateDeviceId() };
  },

  getState() {
    try { return JSON.parse(SafeStore.get(this.stateKey, '{}')) || {}; } catch (error) { return {}; }
  },

  saveState(patch) {
    const state = { ...this.getState(), ...patch };
    SafeStore.set(this.stateKey, JSON.stringify(state));
    return state;
  },

  fillSettings() {
    const settings = this.getSettings();
    document.getElementById('sync-service-url').value = settings.serviceUrl;
    document.getElementById('sync-token').value = settings.token;
    document.getElementById('sync-device-name').value = settings.deviceName;
    document.getElementById('sync-device-id').value = settings.deviceId;
    document.getElementById('sync-auto').checked = settings.autoSync;
    document.getElementById('sync-interval').value = settings.intervalMinutes;
    document.getElementById('sync-retention').value = settings.retentionDays;
    document.getElementById('sync-auto-cleanup').checked = settings.autoCleanup;
    const networkDisabled = !this.networkSupported();
    document.getElementById('sync-network-panel').classList.toggle('sync-network-disabled', networkDisabled);
    document.getElementById('sync-file-warning').hidden = !networkDisabled;
  },

  readFormSettings() {
    return {
      serviceUrl: document.getElementById('sync-service-url').value.trim().replace(/\/+$/, ''),
      token: document.getElementById('sync-token').value.trim(),
      deviceName: document.getElementById('sync-device-name').value.trim().slice(0, 80),
      deviceId: document.getElementById('sync-device-id').value.trim(),
      autoSync: document.getElementById('sync-auto').checked,
      intervalMinutes: Math.max(5, Math.min(1440, Number(document.getElementById('sync-interval').value) || 15)),
      retentionDays: Math.max(1, Math.min(3650, Number(document.getElementById('sync-retention').value) || 30)),
      autoCleanup: document.getElementById('sync-auto-cleanup').checked
    };
  },

  saveSettings(silent = false) {
    const settings = this.readFormSettings();
    if (!VsrArchiveCore.DEVICE_ID_PATTERN.test(settings.deviceId)) {
      this.renderStatus('failed', '设备 ID 格式无效');
      return null;
    }
    if (!settings.deviceName) {
      this.renderStatus('failed', '请填写设备名称');
      return null;
    }
    SafeStore.set(this.settingsKey, JSON.stringify(settings));
    SafeStore.set('syncDeviceId', settings.deviceId);
    this.configureTimer();
    if (!silent) this.renderStatus('success', '同步设置已保存在本机');
    return settings;
  },

  open() {
    document.getElementById('sync-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    this.fillSettings();
    this.renderStatus();
    this.loadLocalConfig();
  },

  close() {
    document.getElementById('sync-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  toggleToken() {
    const input = document.getElementById('sync-token');
    input.type = input.type === 'password' ? 'text' : 'password';
    document.getElementById('sync-token-toggle').textContent = input.type === 'password' ? '显示' : '隐藏';
  },

  renderStatus(kind, message) {
    const state = this.getState();
    let statusKind = kind;
    let text = message;
    if (!statusKind) {
      if (!navigator.onLine) { statusKind = 'offline'; text = '离线：本地计时和复盘可继续使用'; }
      else if (state.lastError) { statusKind = 'failed'; text = `上次失败：${state.lastError}`; }
      else if (state.lastReceipt) { statusKind = 'success'; text = `已归档：${new Date(state.lastReceipt.storedAt).toLocaleString()} · 清理 ${state.lastCleanupCount || 0} 条`; }
      else { statusKind = 'idle'; text = '尚未上传到 Windows 归档'; }
    }
    const badge = document.getElementById('sync-state-badge');
    badge.dataset.state = statusKind;
    badge.textContent = { offline: '离线', syncing: '同步中', success: '已归档', failed: '失败', idle: '未同步' }[statusKind] || statusKind;
    document.getElementById('sync-status').textContent = text || '';
  },

  configureTimer() {
    if (this.timer) clearInterval(this.timer);
    const settings = this.getSettings();
    if (!settings.autoSync || !settings.serviceUrl || !settings.token || !this.networkSupported()) return;
    this.timer = setInterval(() => this.uploadNow('interval'), settings.intervalMinutes * 60000);
  },

  scheduleUpload(reason, delay) {
    const settings = this.getSettings();
    if (!settings.autoSync || !settings.serviceUrl || !settings.token || !this.networkSupported()) return;
    setTimeout(() => this.uploadNow(reason), delay || 0);
  },

  apiUrl(path) {
    const settings = this.getSettings();
    if (!settings.serviceUrl) throw new Error('请填写 Windows 服务地址');
    if (!/^https?:\/\//i.test(settings.serviceUrl)) throw new Error('服务地址必须使用 http:// 或 https://');
    return `${settings.serviceUrl}${path}`;
  },

  authHeaders() {
    const token = this.getSettings().token;
    if (!token) throw new Error('请填写同步 token');
    return { Authorization: `Bearer ${token}` };
  },

  async request(path, options = {}) {
    const response = await fetch(this.apiUrl(path), {
      ...options,
      headers: { ...(options.headers || {}), ...(path === '/api/v1/health' ? {} : this.authHeaders()) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return { response, data };
  },

  async testConnection() {
    const settings = this.saveSettings(true);
    if (!settings || !this.networkSupported()) {
      this.renderStatus('failed', '单文件/file:// 环境不启用自动网络同步，请使用手工导入导出');
      return;
    }
    this.renderStatus('syncing', '正在测试 Windows 服务与 token…');
    try {
      await this.request('/api/v1/health');
      await this.request('/api/v1/snapshots');
      this.renderStatus('success', '连接成功，服务与 token 均有效');
    } catch (error) { this.renderStatus('failed', `连接失败：${error.message}`); }
  },

  readLocalAppData() {
    const output = {};
    VsrArchiveCore.ARCHIVE_KEYS.forEach(key => {
      const raw = SafeStore.get(key, null);
      if (raw === null) return;
      try { output[key] = JSON.parse(raw); } catch (error) { output[key] = raw; }
    });
    return VsrArchiveCore.sanitizeAppData(output);
  },

  createSnapshot() {
    const settings = this.getSettings();
    return VsrArchiveCore.createSnapshot({
      deviceId: settings.deviceId,
      deviceName: settings.deviceName,
      appData: this.readLocalAppData()
    });
  },

  async sha256(text) {
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return VsrArchiveCore.sha256Hex(text);
  },

  async uploadNow(reason) {
    if (!this.networkSupported()) {
      if (reason === 'manual') this.renderStatus('failed', '单文件/file:// 环境保留手工导入导出，不启用自动网络同步');
      return null;
    }
    if (!navigator.onLine) { this.renderStatus('offline', '当前离线，将在联网后重试'); return null; }
    if (this.inFlight) return this.inFlight;
    if (reason !== 'manual' && Date.now() < this.backoffUntil) return null;
    const settings = reason === 'manual' ? this.saveSettings(true) : this.getSettings();
    if (!settings) return null;
    this.inFlight = (async () => {
      this.renderStatus('syncing', '正在生成快照并等待 Windows 持久化确认…');
      const snapshot = this.createSnapshot();
      const rawBody = JSON.stringify(snapshot);
      const expectedHash = await this.sha256(rawBody);
      try {
        const { data } = await this.request('/api/v1/snapshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: rawBody
        });
        const receipt = data.receipt;
        if (!receipt || receipt.durable !== true || receipt.sha256 !== expectedHash || receipt.deviceId !== settings.deviceId) {
          throw new Error('Windows 未返回可验证的持久化回执');
        }
        this.failureCount = 0;
        this.backoffUntil = 0;
        let cleanupCount = 0;
        if (settings.autoCleanup) cleanupCount = this.cleanupAfterReceipt(snapshot, receipt, settings, expectedHash);
        this.saveState({ lastReceipt: receipt, lastError: '', lastCleanupCount: cleanupCount, lastUploadReason: reason });
        this.renderStatus('success', `Windows 已持久化归档 ${receipt.archiveId}；本次安全清理 ${cleanupCount} 条`);
        return receipt;
      } catch (error) {
        this.failureCount += 1;
        const delay = Math.min(30 * 60000, 15000 * (2 ** Math.min(this.failureCount - 1, 7)));
        this.backoffUntil = Date.now() + delay;
        this.saveState({ lastError: error.message, lastFailureAt: new Date().toISOString() });
        this.renderStatus('failed', `归档失败：${error.message}；计时与本地保存不受影响`);
        return null;
      } finally { this.inFlight = null; }
    })();
    return this.inFlight;
  },

  cleanupAfterReceipt(snapshot, receipt, settings, expectedHash) {
    const state = this.getState();
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastCleanupDate === today) return 0;
    const cleaned = VsrArchiveCore.cleanArchivedHistory(this.readLocalAppData(), snapshot.appData, {
      retentionDays: settings.retentionDays,
      now: new Date(),
      receipt,
      expectedSha256: expectedHash
    });
    if (!cleaned.cleanupAuthorized) return 0;
    if (!cleaned.totalRemoved) {
      this.saveState({ lastCleanupDate: today, lastCleanupCount: 0 });
      return 0;
    }
    ['focusSessions', 'dailyReviews', 'sessionReviews', 'dailyCloseEntries', 'focusActivity'].forEach(key => {
      SafeStore.set(key, JSON.stringify(cleaned.appData[key] || (key === 'focusActivity' ? {} : [])));
    });
    if (cleaned.appData.dailyData === undefined) SafeStore.remove('dailyData');
    else SafeStore.set('dailyData', JSON.stringify(cleaned.appData.dailyData));
    if (typeof ReviewManager !== 'undefined') {
      ReviewManager.reviews = cleaned.appData.dailyReviews || [];
      ReviewManager.sessionReviews = cleaned.appData.sessionReviews || [];
      ReviewManager.dailyCloses = cleaned.appData.dailyCloseEntries || [];
    }
    if (typeof Stats !== 'undefined') { Stats.needsRefresh = true; Stats.refresh?.(); }
    if (typeof PomodoroTimer !== 'undefined') PomodoroTimer.loadTodayData?.();
    this.saveState({ lastCleanupDate: today, lastCleanupCount: cleaned.totalRemoved });
    return cleaned.totalRemoved;
  },

  async loadArchives() {
    this.renderStatus('syncing', '正在读取 Windows 归档列表…');
    try {
      const { data } = await this.request('/api/v1/snapshots');
      this.archives = Array.isArray(data.snapshots) ? data.snapshots : [];
      this.renderArchiveList();
      this.renderStatus('success', `找到 ${this.archives.length} 个不可变归档`);
    } catch (error) { this.renderStatus('failed', `读取归档失败：${error.message}`); }
  },

  async fetchArchiveAggregate() {
    if (!this.networkSupported()) return null;
    const settings = this.getSettings();
    if (!settings.serviceUrl || !settings.token) return null;
    const { data } = await this.request('/api/v1/aggregate');
    this.aggregate = data && data.appData ? data : null;
    return this.aggregate;
  },

  renderArchiveList() {
    const container = document.getElementById('sync-archive-list');
    if (!this.archives.length) { container.innerHTML = '<p class="sync-empty">Windows 尚无归档。</p>'; return; }
    container.innerHTML = this.archives.map(item => `<article class="sync-archive-item"><div><strong>${this.escape(item.deviceName || item.deviceId)}</strong><small>${this.escape(new Date(item.storedAt).toLocaleString())} · ${Math.ceil(item.bytes / 1024)} KB</small><code>${this.escape(item.archiveId)}</code></div><div><button class="text-btn" data-action="download" data-device="${this.escape(item.deviceId)}" data-id="${this.escape(item.archiveId)}">下载</button><button class="text-btn danger" data-action="restore" data-device="${this.escape(item.deviceId)}" data-id="${this.escape(item.archiveId)}">恢复</button></div></article>`).join('');
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },

  async handleArchiveAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const item = this.archives.find(archive => archive.deviceId === button.dataset.device && archive.archiveId === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'download') await this.downloadArchive(item, false);
    if (button.dataset.action === 'restore') await this.restoreArchive(item);
  },

  async fetchArchive(item) {
    const response = await fetch(this.apiUrl(`/api/v1/snapshots/${encodeURIComponent(item.deviceId)}/${encodeURIComponent(item.archiveId)}`), { headers: this.authHeaders() });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    const text = await response.text();
    const hash = await this.sha256(text);
    if (hash !== item.sha256 || response.headers.get('X-Archive-SHA256') !== item.sha256) throw new Error('归档哈希校验失败');
    const snapshot = JSON.parse(text);
    const validation = VsrArchiveCore.validateSnapshot(snapshot, { allowOlder: true });
    if (!validation.ok) throw new Error(validation.error);
    return { text, snapshot };
  },

  async downloadArchive(item, silent) {
    try {
      const archive = await this.fetchArchive(item);
      this.downloadJson(archive.text, `vsr-archive-${item.deviceId}-${item.archiveId}.json`);
      if (!silent) this.renderStatus('success', '归档已下载并通过 SHA-256 校验');
      return archive;
    } catch (error) { this.renderStatus('failed', `下载失败：${error.message}`); return null; }
  },

  async restoreArchive(item) {
    if (!window.confirm(`恢复归档将覆盖当前本机学习数据。\n归档设备：${item.deviceName || item.deviceId}\n归档时间：${new Date(item.storedAt).toLocaleString()}\n\n继续前会自动下载本机安全备份。是否继续？`)) return;
    this.renderStatus('syncing', '正在校验归档并生成本机安全备份…');
    try {
      const archive = await this.fetchArchive(item);
      const backup = { schemaVersion: this.latestSchemaVersion, ...this.readLocalAppData(), exportedAt: new Date().toISOString(), backupReason: 'before-archive-restore' };
      this.downloadJson(JSON.stringify(backup, null, 2), `focus-data-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      if (!window.confirm('本机安全备份下载已触发。确认已看到下载后，再覆盖当前本地学习数据？')) return;
      this.applyRestoredData(archive.snapshot.appData);
      this.renderStatus('success', '恢复完成，正在刷新页面…');
      setTimeout(() => window.location.reload(), 500);
    } catch (error) { this.renderStatus('failed', `恢复失败：${error.message}`); }
  },

  applyRestoredData(appData) {
    const clean = VsrArchiveCore.sanitizeAppData(appData);
    const currentDeepseek = (() => { try { return JSON.parse(SafeStore.get('deepseekSettings', '{}')) || {}; } catch (error) { return {}; } })();
    VsrArchiveCore.ARCHIVE_KEYS.forEach(key => {
      if (clean[key] === undefined) return;
      if (key === 'deepseekSettings') {
        SafeStore.set(key, JSON.stringify({ ...clean[key], apiKey: currentDeepseek.apiKey || '' }));
        return;
      }
      SafeStore.set(key, typeof clean[key] === 'string' ? clean[key] : JSON.stringify(clean[key]));
    });
  },

  downloadJson(text, fileName) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async bootstrapLocalArchive() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    if (!/win/i.test(platform)) return;
    try {
      const response = await fetch('/api/v1/local-config');
      if (!response.ok) return;
      const config = await response.json();
      this.localArchiveConfig = config;
      const settings = this.getSettings();
      const next = {
        ...settings,
        serviceUrl: location.origin,
        token: config.token,
        deviceName: settings.deviceName || 'Windows 数据中心',
      };
      SafeStore.set(this.settingsKey, JSON.stringify(next));
      this.configureTimer();
      this.fillSettings();
      this.scheduleUpload('windows-bootstrap', 300);
      return config;
    } catch (error) { return null; }
  },

  async loadLocalConfig() {
    const config = this.localArchiveConfig || await this.bootstrapLocalArchive();
    if (!config) return;
    try {
      document.getElementById('sync-local-config').hidden = false;
      document.getElementById('sync-local-config').innerHTML = `<strong>Windows 归档终端</strong><span>服务地址：${this.escape((config.serviceUrls || []).join(' / ') || location.origin)}</span><span>数据目录：${this.escape(config.dataDirectory)}</span><span>同步 token：<code>${this.escape(config.token)}</code></span>`;
    } catch (error) { /* non-Windows clients cannot read local config */ }
  },

  async importFile(file) {
    const status = document.getElementById('sync-status');
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.focusSessions)) throw new Error('不是虚拟自习室备份文件');
      if (Number(data.schemaVersion || 1) > this.latestSchemaVersion) {
        const ok = window.confirm(`检测到较新的备份版本 ${data.schemaVersion}，当前网页版本是 ${this.latestSchemaVersion}。仍要继续导入吗？`);
        if (!ok) return;
      }
      if (!window.confirm('导入会覆盖本机当前数据，确定继续吗？')) return;
      this.manualKeys.forEach(key => {
      if (data[key] === undefined) return;
        if (key === 'deepseekSettings') {
          let current = {};
          try { current = JSON.parse(SafeStore.get(key, '{}')) || {}; } catch (error) { current = {}; }
          const clean = VsrArchiveCore.sanitizeAppData({ deepseekSettings: data[key] }).deepseekSettings;
          SafeStore.set(key, JSON.stringify({ ...clean, apiKey: current.apiKey || '' }));
          return;
        }
        const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        SafeStore.set(key, value);
      });
      status.textContent = '导入完成，正在刷新页面…';
      setTimeout(() => window.location.reload(), 350);
    } catch (error) { status.textContent = `导入失败：${error.message}`; }
  }
};
