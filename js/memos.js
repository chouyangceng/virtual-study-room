const MemoManager = {
  storageKey: 'memoData',
  timer: null,
  data: { text: '', updatedAt: '' },

  init() {
    this.load();
    const input = document.getElementById('memo-input');
    if (!input) return;
    input.value = this.data.text;
    this.updateCount();
    this.renderStatus(this.data.updatedAt ? `已保存 ${this.formatTime(this.data.updatedAt)}` : '自动保存');
    input.addEventListener('input', () => {
      this.updateCount();
      this.renderStatus('正在编辑…');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.save(), 450);
    });
    input.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        this.save();
      }
    });
    document.getElementById('btn-clear-memo')?.addEventListener('click', () => this.clear());
  },

  load() {
    try {
      const stored = JSON.parse(SafeStore.get(this.storageKey, '{}'));
      this.data = stored && typeof stored === 'object'
        ? { text: String(stored.text || '').slice(0, 5000), updatedAt: String(stored.updatedAt || '') }
        : { text: '', updatedAt: '' };
    } catch (error) {
      this.data = { text: '', updatedAt: '' };
    }
  },

  save() {
    clearTimeout(this.timer);
    const input = document.getElementById('memo-input');
    if (!input) return false;
    this.data = { text: input.value.slice(0, 5000), updatedAt: new Date().toISOString() };
    const saved = SafeStore.set(this.storageKey, JSON.stringify(this.data));
    this.renderStatus(saved ? `已保存 ${this.formatTime(this.data.updatedAt)}` : '保存失败');
    if (saved && typeof SyncManager !== 'undefined') SyncManager.scheduleUpload?.('memo');
    return saved;
  },

  clear() {
    const input = document.getElementById('memo-input');
    if (!input || !input.value) return;
    if (!window.confirm('确定清空备忘录吗？此操作会保存空内容。')) return;
    input.value = '';
    this.updateCount();
    this.save();
    input.focus();
  },

  updateCount() {
    const input = document.getElementById('memo-input');
    const count = document.getElementById('memo-count');
    if (input && count) count.textContent = `${input.value.length} / 5000`;
  },

  renderStatus(text) {
    const status = document.getElementById('memo-status');
    if (status) status.textContent = text;
  },

  formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  },
};
