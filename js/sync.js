const SyncManager = {
  latestSchemaVersion: 2,
  keys: ['focusSessions', 'focusActivity', 'studyPlans', 'tasks', 'timerSettings', 'subjects', 'courses', 'studyGoals', 'dailyReviews', 'dailyCloseEntries', 'appSettings', 'audioSettings', 'deepseekSettings', 'currentSubjectId', 'currentStudyGoal', 'dayClosePromptedDate'],

  init() {
    const modal = document.getElementById('sync-modal');
    document.getElementById('btn-sync').addEventListener('click', () => this.open());
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    document.getElementById('btn-sync-export').addEventListener('click', () => Stats.exportData());
    document.getElementById('btn-sync-import').addEventListener('click', () => document.getElementById('sync-file-input').click());
    document.getElementById('sync-file-input').addEventListener('change', event => { if (event.target.files[0]) this.importFile(event.target.files[0]); event.target.value = ''; });
  },
  open() { document.getElementById('sync-modal').classList.add('active'); document.body.style.overflow = 'hidden'; },
  close() { document.getElementById('sync-modal').classList.remove('active'); document.body.style.overflow = ''; },
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
      this.keys.forEach(key => {
        if (data[key] === undefined) return;
        const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        SafeStore.set(key, value);
      });
      status.textContent = '导入完成，正在刷新页面…';
      setTimeout(() => window.location.reload(), 350);
    } catch (error) { status.textContent = `导入失败：${error.message}`; }
  },
};
