/* ============================================
   subjects.js - Subject goals and daily progress
   ============================================ */

const SubjectManager = {
  subjects: [],
  currentSubjectId: '',
  editingId: '',
  defaults: [
    { name: '政治', color: '#e7835e' },
    { name: '英语', color: '#6c9cf5' },
    { name: '数学', color: '#55b89b' },
    { name: '专业课', color: '#a884e8' },
  ],

  init() {
    this.load();
    this.bindUI();
    this.renderSelectors();
    this.render();
  },

  todayKey(date = new Date()) {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey(date) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  load() {
    try { this.subjects = JSON.parse(localStorage.getItem('subjects') || '[]'); } catch (e) { this.subjects = []; }
    if (!Array.isArray(this.subjects) || !this.subjects.length) {
      this.subjects = this.defaults.map((item, index) => ({ id: `subject-${index + 1}`, ...item, target: '', dailyTasks: 0, dailyMinutes: 0, timeRange: '' }));
      this.save();
    }
    this.currentSubjectId = localStorage.getItem('currentSubjectId') || '';
  },

  save() { SafeStore.set('subjects', JSON.stringify(this.subjects)); },

  bindUI() {
    document.getElementById('btn-subjects').addEventListener('click', () => this.open());
    const modal = document.getElementById('subjects-modal');
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    document.getElementById('subject-edit-select').addEventListener('change', e => this.loadEditor(e.target.value));
    document.getElementById('btn-new-subject').addEventListener('click', () => this.newEditor());
    document.getElementById('btn-save-subject').addEventListener('click', () => this.saveEditor());
    document.getElementById('btn-delete-subject').addEventListener('click', () => this.deleteEditor());
    document.getElementById('btn-download-subject-template').addEventListener('click', () => TemplateManager.download('all'));
    document.getElementById('btn-import-subjects').addEventListener('click', () => document.getElementById('subject-file-input').click());
    document.getElementById('subject-file-input').addEventListener('change', event => {
      if (event.target.files[0]) this.importFile(event.target.files[0]);
      event.target.value = '';
    });
    document.getElementById('task-subject-select').addEventListener('change', e => {
      this.currentSubjectId = e.target.value;
      SafeStore.set('currentSubjectId', this.currentSubjectId);
    });
  },

  renderSelectors() {
    const options = '<option value="">未分类</option>' + this.subjects.map(s => `<option value="${s.id}">${this.escape(s.name)}</option>`).join('');
    document.getElementById('task-subject-select').innerHTML = options;
    document.getElementById('task-subject-select').value = this.currentSubjectId;
    const sessionSelect = document.getElementById('session-subject-select');
    if (sessionSelect) {
      sessionSelect.innerHTML = options;
      sessionSelect.value = this.currentSubjectId;
    }
    document.getElementById('subject-edit-select').innerHTML = this.subjects.map(s => `<option value="${s.id}">${this.escape(s.name)}</option>`).join('');
    if (!this.editingId && this.subjects[0]) this.editingId = this.subjects[0].id;
    document.getElementById('subject-edit-select').value = this.editingId;
  },

  metrics(subject) {
    const tasks = typeof TaskManager === 'undefined' ? [] : TaskManager.getVisibleTasks().filter(task => task.subjectId === subject.id || task.subject === subject.name || task.subjectName === subject.name || task.category === subject.name);
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('focusSessions') || '[]'); } catch (e) {}
    const minutes = Array.isArray(sessions) ? sessions.filter(s => s.date === this.todayKey() && (s.subjectId === subject.id || s.subjectName === subject.name)).reduce((sum, s) => sum + (Number(s.duration) || 0), 0) : 0;
    return { tasks: tasks.length, completed: tasks.filter(task => task.completed).length, minutes };
  },

  render() {
    const grid = document.getElementById('subject-progress-grid');
    grid.innerHTML = this.subjects.map(subject => {
      const m = this.metrics(subject);
      const taskGoal = Number(subject.dailyTasks) || 0;
      const minuteGoal = Number(subject.dailyMinutes) || 0;
      const taskRate = taskGoal ? Math.min(100, Math.round(m.completed / taskGoal * 100)) : 0;
      const minuteRate = minuteGoal ? Math.min(100, Math.round(m.minutes / minuteGoal * 100)) : 0;
      const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(subject.color || '') ? subject.color : '#6c9cf5';
      return `<article class="subject-card" style="--subject-color:${safeColor}"><div class="subject-card-head"><strong>${this.escape(subject.name)}</strong><button class="subject-edit-btn" type="button" data-subject-id="${subject.id}">编辑</button></div><p>${this.escape(subject.target || '还没有设置目标')}</p><div class="subject-progress-label"><span>任务 ${m.completed}/${taskGoal || '—'}</span><b>${taskGoal ? taskRate : '—'}%</b></div><div class="subject-progress-track"><i style="width:${taskGoal ? taskRate : 0}%"></i></div><div class="subject-progress-label"><span>时间 ${m.minutes}/${minuteGoal || '—'} 分钟</span><b>${minuteGoal ? minuteRate : '—'}%</b></div><div class="subject-progress-track"><i style="width:${minuteGoal ? minuteRate : 0}%"></i></div>${subject.timeRange ? `<small>安排：${this.escape(subject.timeRange)}</small>` : ''}</article>`;
    }).join('');
    grid.querySelectorAll('.subject-edit-btn').forEach(button => button.addEventListener('click', () => {
      this.editingId = button.dataset.subjectId;
      this.renderSelectors();
      this.loadEditor(this.editingId);
    }));
  },

  open() {
    this.renderSelectors();
    this.loadEditor(this.editingId || this.subjects[0]?.id);
    this.render();
    document.getElementById('subjects-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('subjects-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  loadEditor(id) {
    const subject = this.subjects.find(item => item.id === id);
    if (!subject) return;
    this.editingId = id;
    document.getElementById('subject-edit-select').value = id;
    document.getElementById('subject-name').value = subject.name || '';
    document.getElementById('subject-target').value = subject.target || '';
    document.getElementById('subject-daily-tasks').value = subject.dailyTasks || '';
    document.getElementById('subject-daily-minutes').value = subject.dailyMinutes || '';
    document.getElementById('subject-time-range').value = subject.timeRange || '';
  },

  newEditor() {
    const id = `subject-${Date.now().toString(36)}`;
    this.subjects.push({ id, name: '新学科', color: '#f0b35e', target: '', dailyTasks: 0, dailyMinutes: 0, timeRange: '' });
    this.editingId = id;
    this.save();
    this.renderSelectors();
    this.loadEditor(id);
    this.render();
  },

  saveEditor() {
    const subject = this.subjects.find(item => item.id === this.editingId);
    if (!subject) return;
    const name = document.getElementById('subject-name').value.trim();
    if (!name) return;
    subject.name = name;
    subject.target = document.getElementById('subject-target').value.trim();
    subject.dailyTasks = Math.max(0, Number(document.getElementById('subject-daily-tasks').value) || 0);
    subject.dailyMinutes = Math.max(0, Number(document.getElementById('subject-daily-minutes').value) || 0);
    subject.timeRange = document.getElementById('subject-time-range').value.trim();
    this.save();
    this.renderSelectors();
    this.render();
    if (typeof TaskManager !== 'undefined') TaskManager.render();
    if (typeof App !== 'undefined') App.showToast('📚 学科目标已保存');
  },

  async importFile(file) {
    if (!window.XLSX) { if (typeof App !== 'undefined') App.showToast('Excel 解析模块未加载，请确认网络后刷新页面'); return; }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames.find(name => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', range: 0 });
        return rows.slice(0, 8).some(row => row.some(cell => ['学科名称', '每日任务量'].includes(String(cell).trim())));
      }) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headerRow = rows.findIndex(row => row.some(cell => String(cell).trim() === '学科名称'));
      if (headerRow < 0) throw new Error('未找到“学科名称”表头');
      const headers = rows[headerRow].map(value => String(value).trim());
      const idx = words => headers.findIndex(h => words.some(word => h.includes(word)));
      const get = (row, words) => { const i = idx(words); return i >= 0 ? String(row[i] ?? '').trim() : ''; };
      let count = 0;
      rows.slice(headerRow + 1).forEach(row => {
        const name = get(row, ['学科名称', '学科']);
        if (!name) return;
        let subject = this.subjects.find(item => item.name === name);
        if (!subject) { subject = { id: `subject-${Date.now().toString(36)}-${count}`, name, color: '#6C9CF5', target: '', dailyTasks: 0, dailyMinutes: 0, timeRange: '' }; this.subjects.push(subject); }
        subject.target = get(row, ['目标']) || subject.target;
        const tasksValue = get(row, ['每日任务量', '每日任务']);
        const minutesValue = get(row, ['每日学习分钟', '每日分钟']);
        if (tasksValue !== '') subject.dailyTasks = Number(tasksValue) || 0;
        if (minutesValue !== '') subject.dailyMinutes = Number(minutesValue) || 0;
        subject.timeRange = get(row, ['时间安排', '时间段']) || subject.timeRange;
        const colorValue = get(row, ['颜色']);
        if (/^#[0-9a-fA-F]{3,8}$/.test(colorValue)) subject.color = colorValue;
        count += 1;
      });
      this.save(); this.renderSelectors(); this.render();
      if (typeof App !== 'undefined') App.showToast(`📥 已导入 ${count} 个学科目标`);
      return count;
    } catch (error) { if (typeof App !== 'undefined') App.showToast(`学科导入失败：${error.message}`); return 0; }
  },

  deleteEditor() {
    if (this.subjects.length <= 1) return;
    this.subjects = this.subjects.filter(item => item.id !== this.editingId);
    if (this.currentSubjectId === this.editingId) this.currentSubjectId = '';
    this.editingId = this.subjects[0].id;
    this.save();
    SafeStore.set('currentSubjectId', this.currentSubjectId);
    this.renderSelectors();
    this.loadEditor(this.editingId);
    this.render();
    if (typeof TaskManager !== 'undefined') TaskManager.render();
  },

  getName(id) { return this.subjects.find(item => item.id === id)?.name || ''; },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
};
