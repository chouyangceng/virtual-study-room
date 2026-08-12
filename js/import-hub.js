/* One file, all template sections. */
const ImportHub = {
  file: null,

  init() {
    const modal = document.getElementById('import-hub-modal');
    const input = document.getElementById('import-hub-file');
    document.getElementById('btn-import-hub').addEventListener('click', () => this.open());
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    document.getElementById('btn-import-hub-select').addEventListener('click', () => input.click());
    input.addEventListener('change', event => { this.setFile(event.target.files[0]); input.value = ''; });
    document.getElementById('btn-import-hub-confirm').addEventListener('click', () => this.importAll());
    const drop = document.getElementById('import-hub-drop');
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag-over'); }));
    drop.addEventListener('drop', event => this.setFile(event.dataTransfer.files[0]));
  },

  open() { document.getElementById('import-hub-modal').classList.add('active'); document.body.style.overflow = 'hidden'; },
  close() { document.getElementById('import-hub-modal').classList.remove('active'); document.body.style.overflow = ''; },
  setFile(file) {
    if (!file) return;
    this.file = file;
    document.getElementById('import-hub-name').textContent = `已选择：${file.name}`;
    document.getElementById('btn-import-hub-confirm').disabled = false;
  },

  async importAll() {
    if (!this.file) return;
    const status = document.getElementById('import-hub-status');
    const button = document.getElementById('btn-import-hub-confirm');
    button.disabled = true;
    status.textContent = '正在导入…';
    try {
      const jobs = [];
      const results = [];
      if (document.getElementById('import-hub-plans').checked) results.push(PlanManager.readFile(this.file).then(count => { if (count) PlanManager.commitPending(); return count; }));
      if (document.getElementById('import-hub-subjects').checked) results.push(SubjectManager.importFile(this.file));
      if (document.getElementById('import-hub-courses').checked) results.push(CourseManager.importFile(this.file));
      const counts = await Promise.all(results);
      PlanManager.render(); SubjectManager.render(); CourseManager.render();
      const labels = ['计划', '学科目标', '课表'];
      const summary = counts.filter(count => typeof count === 'number').map((count, index) => `${labels[index]} ${count}`).join(' · ');
      status.textContent = `导入完成：${summary}`;
      if (typeof App !== 'undefined') App.showToast('📥 一键导入完成');
    } catch (error) {
      status.textContent = `导入失败：${error.message || '请检查模板内容'}`;
    } finally { button.disabled = false; }
  },
};
