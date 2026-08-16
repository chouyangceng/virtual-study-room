/* Weekly and monthly planning. Daily rows import into the unified task list. */
const PlanManager = {
  plans: [],
  pending: null,
  activeScope: 'weekly',

  init() {
    this.loadAndMigrate();
    this.bindUI();
    this.render();
  },

  loadAndMigrate() {
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem('studyPlans') || '[]'); } catch (error) { stored = []; }
    if (!Array.isArray(stored)) stored = [];
    const removed = stored.filter(plan => !['weekly', 'monthly'].includes(plan.scope));
    if (removed.length && !localStorage.getItem('legacyPlansV110')) SafeStore.set('legacyPlansV110', JSON.stringify(removed));
    const taskRows = removed.filter(plan => plan.scope === 'daily').map(plan => ({
      id: `legacy-plan-${plan.id || this.createId()}`,
      planId: plan.id,
      text: plan.title || plan.details || '导入任务',
      kind: plan.date ? 'today' : 'habit',
      date: plan.date || '',
      completed: Boolean(plan.completed),
      completedForDate: plan.completedForDate || '',
      createdAt: plan.createdAt || Date.now(),
      categoryPath: plan.categoryPath || plan.category || '',
      tags: plan.tags || [],
      sourceFile: plan.sourceFile || '1.1.0 数据迁移',
    }));
    if (taskRows.length && typeof TaskManager !== 'undefined') TaskManager.importTasks(taskRows);
    this.plans = stored.filter(plan => ['weekly', 'monthly'].includes(plan.scope)).map(plan => this.normalizePlan(plan));
    this.save();
  },

  normalizePlan(plan) {
    return {
      ...plan,
      id: String(plan.id || this.createId()),
      scope: plan.scope === 'monthly' ? 'monthly' : 'weekly',
      title: String(plan.title || plan.details || '未命名计划').trim(),
      details: String(plan.details || '').trim(),
      completed: Boolean(plan.completed),
      createdAt: Number(plan.createdAt) || Date.now(),
      sourceFile: plan.sourceFile || '手动计划',
    };
  },

  createId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },

  save() {
    SafeStore.set('studyPlans', JSON.stringify(this.plans));
  },

  refreshDailyState() { return false; },

  bindUI() {
    const modal = document.getElementById('plans-modal');
    const input = document.getElementById('plan-file-input');
    document.getElementById('btn-plans')?.addEventListener('click', () => this.open());
    document.getElementById('btn-quick-import')?.addEventListener('click', () => this.open(true));
    document.getElementById('btn-open-weekly-plans')?.addEventListener('click', () => { this.activeScope = 'weekly'; this.open(); });
    modal?.querySelector('.modal-close')?.addEventListener('click', () => this.close());
    modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());
    document.getElementById('btn-select-plan')?.addEventListener('click', event => { event.stopPropagation(); input?.click(); });
    document.getElementById('btn-download-plan-template')?.addEventListener('click', event => { event.stopPropagation(); TemplateManager.download('all'); });
    document.getElementById('plan-import-zone')?.addEventListener('click', event => {
      if (!event.target.closest('button')) input?.click();
    });
    document.getElementById('plan-import-zone')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input?.click(); }
    });
    input?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file) this.readFile(file);
      input.value = '';
    });
    const drop = document.getElementById('plan-import-zone');
    ['dragenter', 'dragover'].forEach(type => drop?.addEventListener(type, event => { event.preventDefault(); drop.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(type => drop?.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag-over'); }));
    drop?.addEventListener('drop', event => { const file = event.dataTransfer?.files?.[0]; if (file) this.readFile(file); });
    document.getElementById('btn-cancel-import')?.addEventListener('click', () => this.cancelImport());
    document.getElementById('btn-confirm-import')?.addEventListener('click', () => this.commitPending());
    document.querySelectorAll('.plan-tab').forEach(tab => tab.addEventListener('click', () => {
      this.activeScope = tab.dataset.scope;
      document.querySelectorAll('.plan-tab').forEach(item => item.classList.toggle('active', item === tab));
      this.render();
    }));
  },

  open(importFirst = false) {
    this.render();
    document.getElementById('plans-modal')?.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (importFirst) setTimeout(() => document.getElementById('plan-import-zone')?.focus(), 50);
  },

  close() {
    document.getElementById('plans-modal')?.classList.remove('active');
    document.body.style.overflow = '';
  },

  async readFile(file) {
    if (!file || !window.XLSX) throw new Error('Excel 解析组件尚未加载');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const plans = [];
      const tasks = [];
      workbook.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
        this.parseSheet(rows, sheetName, file.name, plans, tasks);
      });
      this.pending = { plans, tasks, fileName: file.name };
      this.renderImportPreview();
      return plans.length + tasks.length;
    } catch (error) {
      this.showError(`导入失败：${error.message || '无法读取文件'}`);
      throw error;
    }
  },

  parseSheet(rows, sheetName, fileName, plans, tasks) {
    if (!Array.isArray(rows) || !rows.length) return;
    if (/填写说明|使用说明|readme|guide/i.test(sheetName)) return;
    const headerRow = rows.slice(0, 20).findIndex(row => row.some(cell => /任务|计划|标题|内容|类型|周|月/.test(this.text(cell))));
    if (headerRow < 0) return;
    const headers = rows[headerRow].map(cell => this.text(cell));
    const index = names => headers.findIndex(header => names.some(name => header.toLowerCase().includes(name.toLowerCase())));
    const titleIndex = index(['任务内容', '任务名称', '计划内容', '计划名称', '标题', '任务', '内容']);
    const typeIndex = index(['计划类型', '类型', 'scope']);
    const detailIndex = index(['详细说明', '说明', '详情', '验收标准', '备注']);
    const dateIndex = index(['日期']);
    const weekIndex = index(['周次', '第几周', '周']);
    const weekdayIndex = index(['星期', '周几']);
    const monthIndex = index(['月份', '月度']);
    const categoryIndex = index(['分类路径', '分类', '科目', '学科']);
    const tagsIndex = index(['标签']);
    if (titleIndex < 0) return;
    rows.slice(headerRow + 1).forEach((row, rowIndex) => {
      const title = this.text(titleIndex >= 0 ? row[titleIndex] : row.find(cell => this.text(cell)));
      if (!title) return;
      const type = this.text(typeIndex >= 0 ? row[typeIndex] : sheetName).toLowerCase();
      const inferred = /月|month/.test(type) ? 'monthly' : /周|week/.test(type) ? 'weekly' : /每日坚持|习惯|habit|固定/.test(type) ? 'habit' : 'today';
      const common = {
        id: `${Date.now().toString(36)}-${rowIndex}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        details: this.text(detailIndex >= 0 ? row[detailIndex] : ''),
        sourceFile: fileName,
        sourceSheet: sheetName,
        categoryPath: this.text(categoryIndex >= 0 ? row[categoryIndex] : ''),
        tags: this.text(tagsIndex >= 0 ? row[tagsIndex] : '').split(/[,，#]+/).map(tag => tag.trim()).filter(Boolean),
        createdAt: Date.now(),
      };
      if (inferred === 'weekly' || inferred === 'monthly') {
        plans.push(this.normalizePlan({
          ...common,
          scope: inferred,
          week: this.text(weekIndex >= 0 ? row[weekIndex] : ''),
          weekday: this.text(weekdayIndex >= 0 ? row[weekdayIndex] : ''),
          month: this.normalizeMonth(monthIndex >= 0 ? row[monthIndex] : ''),
        }));
      } else {
        tasks.push({
          id: common.id,
          text: title,
          kind: inferred,
          date: inferred === 'today' ? (this.normalizeDate(dateIndex >= 0 ? row[dateIndex] : '') || TaskManager.getTodayKey()) : '',
          categoryPath: common.categoryPath,
          tags: common.tags,
          sourceFile: fileName,
        });
      }
    });
  },

  normalizeDate(value) {
    const text = this.text(value).replace(/[./]/g, '-');
    const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
  },

  normalizeMonth(value) {
    const text = this.text(value).replace(/[./]/g, '-');
    const match = text.match(/(\d{4})-(\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
  },

  renderImportPreview() {
    const pending = this.pending;
    if (!pending) return;
    document.getElementById('import-preview')?.classList.remove('hidden');
    document.getElementById('import-file-name').textContent = pending.fileName;
    document.getElementById('import-weekly-count').textContent = pending.plans.filter(plan => plan.scope === 'weekly').length;
    document.getElementById('import-monthly-count').textContent = pending.plans.filter(plan => plan.scope === 'monthly').length;
    document.getElementById('import-hint').textContent = pending.tasks.length ? `另有 ${pending.tasks.length} 条每日事项，将直接进入“每日任务”。` : '仅导入周计划和月计划。';
    const preview = [...pending.tasks.map(task => ({ label: task.kind === 'habit' ? '每日坚持' : '今日任务', title: task.text })), ...pending.plans.map(plan => ({ label: this.scopeLabel(plan.scope), title: plan.title }))];
    document.getElementById('import-preview-list').innerHTML = preview.slice(0, 14).map(item => `<div><span>${item.label}</span><strong>${this.escape(item.title)}</strong></div>`).join('');
  },

  cancelImport() {
    this.pending = null;
    document.getElementById('import-preview')?.classList.add('hidden');
  },

  commitPending() {
    if (!this.pending) return 0;
    const existing = new Set(this.plans.map(plan => [plan.scope, plan.title, plan.week, plan.month, plan.sourceFile].join('|')));
    let addedPlans = 0;
    this.pending.plans.forEach(plan => {
      const key = [plan.scope, plan.title, plan.week, plan.month, plan.sourceFile].join('|');
      if (!existing.has(key)) { this.plans.push(plan); existing.add(key); addedPlans += 1; }
    });
    const addedTasks = typeof TaskManager !== 'undefined' ? TaskManager.importTasks(this.pending.tasks) : 0;
    this.save();
    const total = addedPlans + addedTasks;
    this.cancelImport();
    this.render();
    this.showMessage(`已导入 ${addedPlans} 条周/月计划、${addedTasks} 条每日任务`);
    return total;
  },

  getSources() {
    const map = new Map();
    this.plans.forEach(plan => {
      const name = plan.sourceFile || '手动计划';
      const item = map.get(name) || { name, count: 0 };
      item.count += 1;
      map.set(name, item);
    });
    if (typeof TaskManager !== 'undefined') TaskManager.tasks.filter(task => task.sourceFile).forEach(task => {
      const name = task.sourceFile;
      const item = map.get(name) || { name, count: 0 };
      item.count += 1;
      map.set(name, item);
    });
    return [...map.values()];
  },

  visiblePlans() {
    if (this.activeScope === 'all') return [...this.plans];
    return this.plans.filter(plan => plan.scope === this.activeScope);
  },

  render() {
    document.querySelectorAll('.plan-tab').forEach(tab => {
      const selected = tab.dataset.scope === this.activeScope;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    const plans = this.visiblePlans().sort((a, b) => (a.completed - b.completed) || (b.createdAt - a.createdAt));
    const completed = plans.filter(plan => plan.completed).length;
    const labels = { weekly: '本周计划', monthly: '本月计划', all: '全部计划' };
    const title = document.getElementById('plan-view-title');
    if (title) title.textContent = labels[this.activeScope] || '计划';
    const progress = document.getElementById('plan-progress-text');
    if (progress) progress.textContent = `${completed} / ${plans.length}`;
    const list = document.getElementById('plan-list');
    if (list) {
      list.innerHTML = plans.length ? plans.map(plan => `<article class="plan-item${plan.completed ? ' completed' : ''}" data-plan-id="${this.escape(plan.id)}"><button class="plan-check" type="button" aria-label="${plan.completed ? '标记未完成' : '标记完成'}">${plan.completed ? '✓' : ''}</button><div class="plan-item-main"><strong>${this.escape(plan.title)}</strong><p>${this.escape(plan.details)}</p><div class="plan-meta"><span>${this.scopeLabel(plan.scope)}</span>${plan.week ? `<span>第 ${this.escape(plan.week)} 周</span>` : ''}${plan.weekday ? `<span>${this.escape(plan.weekday)}</span>` : ''}${plan.month ? `<span>${this.escape(plan.month)}</span>` : ''}</div></div><button class="plan-item-delete text-btn danger" type="button">删除</button></article>`).join('') : '<p class="plan-empty">暂无计划，可从 Excel 导入。</p>';
      list.querySelectorAll('.plan-item').forEach(item => item.querySelector('.plan-check')?.addEventListener('click', () => this.toggle(item.dataset.planId)));
      list.querySelectorAll('.plan-item-delete').forEach(button => button.addEventListener('click', event => this.deletePlan(event.currentTarget.closest('.plan-item').dataset.planId)));
    }
    this.renderSources();
    this.renderScopeSummary();
    this.renderWeeklyPreview();
  },

  renderSources() {
    const sources = this.getSources();
    const section = document.getElementById('plan-sources');
    const list = document.getElementById('plan-source-list');
    if (!section || !list) return;
    section.classList.toggle('hidden', !sources.length);
    list.innerHTML = sources.map(source => `<div class="plan-source-row"><div class="plan-source-info"><strong>${this.escape(source.name)}</strong><small>${source.count} 条任务或计划</small></div><button class="plan-source-delete" type="button" data-source="${this.escape(source.name)}">删除整张表</button></div>`).join('');
    list.querySelectorAll('.plan-source-delete').forEach(button => button.addEventListener('click', () => this.deleteSource(button.dataset.source)));
  },

  renderScopeSummary() {
    const target = document.getElementById('plan-scope-summary');
    if (!target) return;
    target.innerHTML = [['weekly', '本周'], ['monthly', '本月']].map(([scope, label]) => {
      const rows = this.plans.filter(plan => plan.scope === scope);
      const completed = rows.filter(plan => plan.completed).length;
      const rate = rows.length ? Math.round(completed / rows.length * 100) : 0;
      return `<button type="button" class="plan-scope-card${this.activeScope === scope ? ' active' : ''}" data-scope-jump="${scope}"><strong>${label}</strong><span>${completed}/${rows.length}</span><i style="width:${rate}%"></i></button>`;
    }).join('');
    target.querySelectorAll('[data-scope-jump]').forEach(button => button.addEventListener('click', () => {
      this.activeScope = button.dataset.scopeJump;
      this.render();
    }));
  },

  renderWeeklyPreview() {
    const target = document.getElementById('weekly-plan-preview');
    if (!target) return;
    const plans = this.plans.filter(plan => plan.scope === 'weekly');
    if (!plans.length) { target.innerHTML = '<span>尚未导入每周计划</span>'; return; }
    const completed = plans.filter(plan => plan.completed).length;
    target.innerHTML = `<small class="weekly-plan-rate">已完成 ${completed}/${plans.length} · ${Math.round(completed / plans.length * 100)}%</small>` + plans.slice(0, 5).map(plan => `<div><strong>${plan.completed ? '✓ ' : ''}${this.escape(plan.title)}</strong><small>${this.escape(plan.weekday || (plan.week ? `第${plan.week}周` : '每周'))}</small></div>`).join('');
  },

  toggle(id) {
    const plan = this.plans.find(item => item.id === id);
    if (!plan) return;
    plan.completed = !plan.completed;
    this.save();
    this.render();
  },

  deletePlan(id) {
    const plan = this.plans.find(item => item.id === id);
    if (!plan || !window.confirm(`删除计划「${plan.title}」？`)) return;
    this.plans = this.plans.filter(item => item.id !== id);
    this.save();
    this.render();
  },

  deleteSource(name) {
    const count = this.plans.filter(plan => (plan.sourceFile || '手动计划') === name).length;
    const taskCount = typeof TaskManager !== 'undefined' ? TaskManager.tasks.filter(task => task.sourceFile === name).length : 0;
    if ((!count && !taskCount) || !window.confirm(`删除「${name}」中的 ${count} 条周/月计划和 ${taskCount} 条每日任务？`)) return;
    this.plans = this.plans.filter(plan => (plan.sourceFile || '手动计划') !== name);
    if (typeof TaskManager !== 'undefined') TaskManager.deleteBySource(name);
    this.save();
    this.render();
  },

  syncFromTask() {},
  scopeLabel(scope) { return scope === 'monthly' ? '月计划' : '周计划'; },
  text(value) { return String(value ?? '').trim(); },
  escape(value) { return this.text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); },
  showMessage(message) { if (typeof App !== 'undefined') App.showToast(`✅ ${message}`); },
  showError(message) { if (typeof App !== 'undefined') App.showToast(`⚠️ ${message}`); },
};
