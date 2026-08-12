/* ============================================
   plans.js - Import and manage study plans
   Excel / CSV import stays local in the browser.
   ============================================ */

const PlanManager = {
  plans: [],
  pending: null,
  activeScope: 'daily',
  draggedPlanId: null,
  gridStart: null,
  gridEnd: null,
  gridSelecting: false,

  init() {
    this.load();
    this.migrateSchedule();
    this.bindUI();
  },

  load() {
    try {
      const value = JSON.parse(localStorage.getItem('studyPlans') || '[]');
      this.plans = Array.isArray(value) ? value.map(plan => {
        const schedule = this.extractSchedule(plan.details || plan.title, plan.timeSlot);
        return { ...plan, scheduleTime: plan.scheduleTime || schedule.time, durationMinutes: plan.durationMinutes || schedule.minutes };
      }) : [];
    } catch (e) { this.plans = []; }
  },

  save() { SafeStore.set('studyPlans', JSON.stringify(this.plans)); },

  migrateSchedule() {
    this.save();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (!Array.isArray(tasks)) return;
    let changed = false;
    tasks.forEach(task => {
      const plan = this.plans.find(item => item.id === task.planId);
      if (!plan) return;
      const label = this.taskLabel(plan);
      if (task.text !== label) { task.text = label; changed = true; }
    });
    if (changed) SafeStore.set('tasks', JSON.stringify(tasks));
  },

  refreshDailyState() {
    const today = this.todayKey();
    let changed = false;
    this.plans.forEach(plan => {
      if (plan.scope === 'daily' && !plan.date && plan.completedForDate !== today) {
        if (plan.completed) changed = true;
        plan.completed = false;
        plan.completedForDate = today;
      }
    });
    if (changed) this.save();
    return changed;
  },

  getSources() {
    const sources = {};
    this.plans.forEach(plan => {
      const name = plan.sourceFile || '手动计划';
      if (!sources[name]) sources[name] = { name, count: 0, scopes: {}, dates: [] };
      sources[name].count += 1;
      sources[name].scopes[plan.scope] = (sources[name].scopes[plan.scope] || 0) + 1;
      if (plan.date) sources[name].dates.push(plan.date);
    });
    return Object.values(sources).sort((a, b) => b.count - a.count);
  },

  bindUI() {
    const modal = document.getElementById('plans-modal');
    document.getElementById('btn-plans').addEventListener('click', () => this.open());
    document.getElementById('btn-quick-import').addEventListener('click', () => this.open(true));
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());

    const zone = document.getElementById('plan-import-zone');
    const input = document.getElementById('plan-file-input');
    document.getElementById('btn-select-plan').addEventListener('click', () => input.click());
    zone.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      input.click();
    });
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') input.click();
    });
    input.addEventListener('change', (event) => {
      if (event.target.files[0]) this.readFile(event.target.files[0]);
      event.target.value = '';
    });
    ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, (event) => {
      event.preventDefault(); zone.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, (event) => {
      event.preventDefault(); zone.classList.remove('drag-over');
    }));
    zone.addEventListener('drop', (event) => {
      const file = event.dataTransfer.files[0];
      if (file) this.readFile(file);
    });
    document.getElementById('btn-cancel-import').addEventListener('click', () => this.clearPending());
    document.getElementById('btn-confirm-import').addEventListener('click', () => this.commitPending());
    document.getElementById('btn-download-plan-template').addEventListener('click', () => TemplateManager.download('all'));
    document.getElementById('btn-carry-forward').addEventListener('click', () => this.carryForwardIncomplete());
    document.getElementById('btn-assign-time-grid').addEventListener('click', () => this.assignTimeGrid());
    document.addEventListener('pointerup', () => {
      if (this.gridSelecting) { this.gridSelecting = false; this.updateGridSelectionLabel(); }
    });
    document.querySelectorAll('.plan-tab').forEach(tab => tab.addEventListener('click', () => {
      this.activeScope = tab.dataset.scope;
      document.querySelectorAll('.plan-tab').forEach(item => item.classList.toggle('active', item === tab));
      this.render();
    }));
    document.getElementById('btn-open-weekly-plans')?.addEventListener('click', () => { this.open(); document.querySelector('.plan-tab[data-scope="weekly"]')?.click(); });
  },

  open(focusImport = false) {
    document.getElementById('plans-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    this.render();
    if (focusImport) document.getElementById('plan-file-input').click();
  },

  close() {
    document.getElementById('plans-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  todayKey(date = new Date()) {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey(date) : this.calendarKey(date);
  },

  calendarKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return this.calendarKey(value);
    if (typeof value === 'number' && window.XLSX?.SSF) {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    const text = String(value || '').trim();
    if (!text) return '';
    const normalized = text.replace(/[年./]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/--+/g, '-');
    const match = normalized.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : this.calendarKey(parsed);
  },

  normalize(text) { return String(text || '').replace(/\s+/g, '').toLowerCase(); },
  matchesWord(cell, word) {
    return word.length <= 1 ? cell === word : cell.includes(word);
  },
  isBlank(value) { return value === null || value === undefined || String(value).trim() === ''; },
  text(value) { return String(value ?? '').trim(); },
  firstLine(value) { return this.text(value).split(/\r?\n/)[0].trim(); },

  findHeader(rows, rules) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const row = (rows[i] || []).map(cell => this.normalize(cell));
      const nonBlank = row.filter(Boolean).length;
      const hits = rules.filter(rule => row.some(cell => rule.some(word => this.matchesWord(cell, word))));
      if (hits.length >= 1 && nonBlank >= 2) return { index: i, values: rows[i] || [] };
    }
    return null;
  },

  headerIndex(headers, words) {
    return headers.findIndex(header => words.some(word => this.matchesWord(this.normalize(header), word)));
  },

  classify(text) {
    const value = this.text(text);
    if (/阅读|书|资料|真题|范文|词汇|听力|口语|雅思/i.test(value)) return '阅读/语言';
    if (/运动|健身|训练|拉伸|羽毛球|力量/i.test(value)) return '运动';
    if (/控制|simulink|算法|规划|工程|pid/i.test(value)) return '专业学习';
    return '学习';
  },

  makePlan(data) {
    const title = this.firstLine(data.title || data.details);
    if (!title) return null;
    return {
      id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      details: this.text(data.details || data.title),
      scope: data.scope || 'daily',
      date: data.date || '',
      week: data.week || '',
      month: data.month || (data.date ? data.date.slice(0, 7) : ''),
      weekday: data.weekday || '',
      timeSlot: this.text(data.timeSlot),
      stage: this.text(data.stage),
      activeFrom: data.activeFrom || '',
      activeTo: data.activeTo || '',
      scheduleTime: data.scheduleTime || this.extractSchedule(data.details || data.title, data.timeSlot).time,
      durationMinutes: data.durationMinutes || this.extractSchedule(data.details || data.title, data.timeSlot).minutes,
      category: data.category || this.classify(`${title} ${data.details || ''}`),
      categoryPath: this.text(data.categoryPath),
      tags: Array.isArray(data.tags) ? data.tags : this.text(data.tags).split(/[,，#]+/).map(tag => tag.trim()).filter(Boolean),
      sourceSheet: data.sourceSheet || '',
      sourceFile: data.sourceFile || '',
      completed: false,
      createdAt: Date.now(),
    };
  },

  extractSchedule(text, timeSlot = '') {
    const value = this.text(text);
    const range = value.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)\s*[—\-~至]\s*([01]?\d|2[0-3]):([0-5]\d)/);
    const time = range || value.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)/);
    let minutes = 0;
    if (range) {
      minutes = (Number(range[3]) * 60 + Number(range[4])) - (Number(range[1]) * 60 + Number(range[2]));
      if (minutes <= 0) minutes += 24 * 60;
    }
    const durationPattern = /(\d+(?:\.\d+)?)\s*(小时|小時|h|hr|分钟|分|min)/gi;
    let match;
    while ((match = durationPattern.exec(value))) {
      const amount = Number(match[1]);
      minutes += /小时|小時|^h|hr/i.test(match[2]) ? Math.round(amount * 60) : Math.round(amount);
    }
    return { time: time ? `${String(time[1]).padStart(2, '0')}:${time[2]}` : '', minutes: minutes || 0 };
  },

  parseStageRange(stage) {
    const value = this.text(stage);
    const year = value.match(/(20\d{2})/);
    if (!year) return { from: '', to: '' };
    const yearNumber = Number(year[1]);
    if (/下半年/.test(value)) return { from: `${yearNumber}-07-01`, to: `${yearNumber}-12-31` };
    const range = value.match(/20\d{2}[.年](\d{1,2})\s*[—\-~至]\s*(?:(20\d{2})[.年])?(\d{1,2}|考前|年底)/);
    if (!range) return { from: '', to: '' };
    const fromMonth = Number(range[1]);
    const toYear = Number(range[2] || yearNumber);
    const toMonth = /考前|年底/.test(range[3]) ? 12 : Number(range[3]);
    const lastDay = new Date(toYear, toMonth, 0).getDate();
    return { from: `${yearNumber}-${String(fromMonth).padStart(2, '0')}-01`, to: `${toYear}-${String(toMonth).padStart(2, '0')}-${lastDay}` };
  },

  stageApplicable(stage, date = this.todayKey()) {
    if (!stage) return true;
    const range = this.parseStageRange(stage);
    return (!range.from || date >= range.from) && (!range.to || date <= range.to);
  },

  scheduleLabel(plan) {
    const parts = [];
    if (plan.scheduleTime) parts.push(plan.scheduleTime);
    if (plan.durationMinutes) parts.push(`${plan.durationMinutes} 分钟`);
    else if (plan.scope === 'daily') parts.push('时长待补充');
    return parts.join(' · ');
  },

  formatTime(totalMinutes) {
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  },

  taskLabel(plan) {
    const schedule = this.scheduleLabel(plan);
    return schedule ? `${schedule}｜${plan.title}` : plan.title;
  },

  timeToMinutes(time) {
    if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  },

  findConflicts(plans) {
    const scheduled = plans.filter(plan => plan.scheduleTime && plan.durationMinutes).map(plan => ({
      plan,
      start: this.timeToMinutes(plan.scheduleTime),
      end: this.timeToMinutes(plan.scheduleTime) + plan.durationMinutes,
    })).sort((a, b) => a.start - b.start);
    const conflicts = new Set();
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length && scheduled[j].start < scheduled[i].end; j++) {
        conflicts.add(scheduled[i].plan.id);
        conflicts.add(scheduled[j].plan.id);
      }
    }
    return conflicts;
  },

  addCellPlans(target, row, headers, options) {
    const excluded = options.excluded || [];
    headers.forEach((header, index) => {
      if (excluded.includes(index) || this.isBlank(row[index])) return;
      const details = this.text(row[index]);
      const plan = this.makePlan({ ...options, title: `${header}：${this.firstLine(details)}`, details, timeSlot: header });
      if (plan) target.push(plan);
    });
  },

  parseSheet(sheetName, rows, fileName) {
    const result = [];
    if (!Array.isArray(rows) || rows.length < 2) return result;
    const name = this.normalize(sheetName);
    const header = this.findHeader(rows, [['日期', 'date'], ['周次', '星期', '日'], ['资料', '书名', '阅读'], ['时间', '时段'], ['任务', '事项', '学习内容', '任务内容']]);
    if (!header) return result;
    const headers = header.values.map(cell => this.text(cell));
    const start = header.index + 1;
    const dateIdx = this.headerIndex(headers, ['日期', 'date']);
    const weekIdx = this.headerIndex(headers, ['周次', 'week']);
    const weekdayIdx = this.headerIndex(headers, ['星期', '日']);
    const phaseIdx = this.headerIndex(headers, ['阶段']);
    const dayTypeIdx = this.headerIndex(headers, ['日类型']);
    const monthIdx = this.headerIndex(headers, ['月份', '月度']);
    const titleIdx = this.headerIndex(headers, ['资料', '书名', '阅读计划', '书目']);
    const usageIdx = this.headerIndex(headers, ['怎么用', '用法', '说明', '备注']);
    const frequencyIdx = this.headerIndex(headers, ['频率', '周期']);
    const statusIdx = this.headerIndex(headers, ['完成状态', '状态']);
    const timeIdx = this.headerIndex(headers, ['时间', '时段', '开始时间', '起始时间']);
    const taskIdx = this.headerIndex(headers, ['任务', '事项', '学习内容']);
    const templateTaskIdx = this.headerIndex(headers, ['任务内容']);
    const typeIdx = this.headerIndex(headers, ['类型', '计划类型', 'scope']);
    const durationIdx = this.headerIndex(headers, ['时长分钟', '计划时长', '时长']);
    const subjectIdx = this.headerIndex(headers, ['学科', '科目']);
    const categoryPathIdx = this.headerIndex(headers, ['分类路径', '多级分类', '分类']);
    const tagsIdx = this.headerIndex(headers, ['标签', 'tags', 'tag']);
    const stageIdx = this.headerIndex(headers, ['适用阶段', '阶段']);
    const standardIdx = this.headerIndex(headers, ['执行标准', '标准']);
    const readingSheet = /阅读|书单|资料|书目/.test(name) || titleIdx >= 0 && usageIdx >= 0;
    const dailySheet = /每日|日计划|daily/.test(name);
    const routineSheet = timeIdx >= 0 && taskIdx >= 0 && /作息|日程|时间表|每日/.test(name);

    let currentStage = '';
    for (let r = start; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every(cell => this.isBlank(cell))) continue;
      if (stageIdx >= 0 && !this.isBlank(row[stageIdx])) currentStage = this.text(row[stageIdx]);
      if (routineSheet && !this.isBlank(row[timeIdx]) && !this.isBlank(row[taskIdx])) {
        const schedule = this.extractSchedule(row[timeIdx]);
        const stageRange = this.parseStageRange(currentStage);
        const routine = this.makePlan({ scope: 'daily', title: row[taskIdx], details: standardIdx >= 0 ? row[standardIdx] : row[taskIdx], timeSlot: row[timeIdx], scheduleTime: schedule.time, durationMinutes: schedule.minutes, stage: currentStage, activeFrom: stageRange.from, activeTo: stageRange.to, sourceSheet: sheetName, sourceFile: fileName, category: this.classify(`${row[taskIdx]} ${row[standardIdx] || ''}`) });
        if (routine) result.push(routine);
        continue;
      }
      const date = dateIdx >= 0 ? this.parseDate(row[dateIdx]) : '';
      const week = weekIdx >= 0 ? this.text(row[weekIdx]) : '';
      const weekday = weekdayIdx >= 0 ? this.text(row[weekdayIdx]) : '';
      const month = monthIdx >= 0 ? this.text(row[monthIdx]) : (date ? date.slice(0, 7) : '');
      if (readingSheet && titleIdx >= 0 && !this.isBlank(row[titleIdx])) {
        const details = [usageIdx >= 0 ? row[usageIdx] : '', frequencyIdx >= 0 ? `频率：${row[frequencyIdx]}` : ''].filter(v => !this.isBlank(v)).join('；');
        const plan = this.makePlan({ scope: 'reading', title: row[titleIdx], details, week, month, category: '阅读/资料', sourceSheet: sheetName, sourceFile: fileName });
        if (plan) result.push(plan);
        continue;
      }
      const type = typeIdx >= 0 ? this.normalize(row[typeIdx]) : '';
      const scope = /weekly|周计划|每周|周/.test(type) ? 'weekly' : /monthly|月计划|每月|月/.test(type) ? 'monthly' : /reading|阅读|资料/.test(type) ? 'reading' : (dailySheet ? 'daily' : 'weekly');
      const excluded = [dateIdx, weekIdx, weekdayIdx, phaseIdx, dayTypeIdx, monthIdx, titleIdx, templateTaskIdx, usageIdx, frequencyIdx, statusIdx, typeIdx, durationIdx, subjectIdx, categoryPathIdx, tagsIdx, this.headerIndex(headers, ['资料来源']), this.headerIndex(headers, ['计划时长']), this.headerIndex(headers, ['实际时长'])].filter(index => index >= 0);
      const base = { scope, date, week, weekday, month, sourceSheet: sheetName, sourceFile: fileName, completed: statusIdx >= 0 && /已完成|完成|yes|true/.test(this.normalize(row[statusIdx])), category: subjectIdx >= 0 ? this.text(row[subjectIdx]) || (phaseIdx >= 0 ? this.text(row[phaseIdx]) : undefined) : (phaseIdx >= 0 ? this.text(row[phaseIdx]) || undefined : undefined), categoryPath: categoryPathIdx >= 0 ? this.text(row[categoryPathIdx]) : '', tags: tagsIdx >= 0 ? this.text(row[tagsIdx]) : '' };
      const rowTitle = templateTaskIdx >= 0 ? this.text(row[templateTaskIdx]) : '';
      if (rowTitle) {
        const schedule = this.extractSchedule(row[timeIdx >= 0 ? timeIdx : -1] || '', row[timeIdx >= 0 ? timeIdx : -1] || '');
        const plan = this.makePlan({ ...base, title: rowTitle, details: row[usageIdx >= 0 ? usageIdx : -1] || rowTitle, timeSlot: timeIdx >= 0 ? row[timeIdx] : '', scheduleTime: schedule.time, durationMinutes: durationIdx >= 0 ? Number(row[durationIdx]) || schedule.minutes : schedule.minutes });
        if (plan) result.push(plan);
      } else this.addCellPlans(result, row, headers, { ...base, excluded });
      if (phaseIdx >= 0 && !this.isBlank(row[phaseIdx]) && dailySheet) {
        const phase = this.makePlan({ ...base, title: `阶段目标：${row[phaseIdx]}`, details: row[phaseIdx], timeSlot: '阶段目标', scope: 'daily' });
        if (phase) result.push(phase);
      }
    }
    return result;
  },

  deriveMonthly(plans, fileName) {
    const groups = {};
    plans.filter(plan => plan.scope === 'daily' && plan.date && /主目标|目标/.test(plan.timeSlot)).forEach(plan => {
      const key = plan.date.slice(0, 7);
      groups[key] = groups[key] || [];
      if (!groups[key].some(item => item === plan.title)) groups[key].push(plan.title);
    });
    return Object.entries(groups).map(([month, titles]) => this.makePlan({
      scope: 'monthly', month, title: `${month} 月度主线`, details: titles.slice(0, 8).join('\n'), category: '月度目标', sourceSheet: '自动汇总', sourceFile: fileName,
    })).filter(Boolean);
  },

  async readFile(file) {
    if (!window.XLSX) { this.showMessage('Excel 解析模块未加载，请确认网络后刷新页面'); return; }
    if (file.size > 10 * 1024 * 1024) { this.showError('文件超过 10MB，请拆分后再导入'); return; }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(extension)) { this.showError('请选择 Excel 或 CSV 文件'); return; }
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false });
      let plans = [];
      workbook.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
        plans = plans.concat(this.parseSheet(sheetName, rows, file.name));
      });
      plans = plans.concat(this.deriveMonthly(plans, file.name));
      const unique = new Map();
      plans.forEach(plan => unique.set([plan.scope, plan.date, plan.week, plan.month, plan.title, plan.sourceSheet].join('|'), plan));
      this.pending = { fileName: file.name, plans: [...unique.values()] };
      this.renderPreview();
      return this.pending.plans.length;
    } catch (error) {
      this.showError('读取失败：请确认文件是有效的 Excel 或 CSV 格式');
      console.error(error);
      return 0;
    }
  },

  renderPreview() {
    const plans = this.pending?.plans || [];
    const count = scope => plans.filter(plan => plan.scope === scope).length;
    document.getElementById('import-file-name').textContent = this.pending?.fileName || '—';
    document.getElementById('import-daily-count').textContent = count('daily');
    document.getElementById('import-weekly-count').textContent = count('weekly');
    document.getElementById('import-monthly-count').textContent = count('monthly');
    document.getElementById('import-reading-count').textContent = count('reading');
    document.getElementById('import-hint').textContent = plans.length ? `已识别 ${plans.length} 条计划，确认后会写入本地并同步今日任务。` : '没有识别到可用计划，请检查表头是否包含日期、周次、资料或任务内容。';
    document.getElementById('import-preview-list').innerHTML = plans.slice(0, 14).map(plan => `<div><span>${this.scopeLabel(plan.scope)}</span><strong>${this.escape(plan.title)}</strong><small>${this.escape(plan.date || plan.month || (plan.week ? `第 ${plan.week} 周` : plan.sourceSheet))}</small></div>`).join('');
    document.getElementById('import-preview').classList.remove('hidden');
    document.getElementById('plan-import-zone').classList.add('compact-zone');
    document.getElementById('btn-confirm-import').disabled = plans.length === 0;
    this.renderSources();
  },

  clearPending() {
    this.pending = null;
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('plan-import-zone').classList.remove('compact-zone');
    this.renderSources();
  },

  renderSources() {
    const section = document.getElementById('plan-sources');
    const list = document.getElementById('plan-source-list');
    if (!section || !list) return;
    const sources = this.getSources().filter(source => source.name !== '手动计划');
    section.classList.toggle('hidden', sources.length === 0);
    list.innerHTML = sources.map(source => {
      const scopeSummary = Object.entries(source.scopes).map(([scope, count]) => `${this.scopeLabel(scope)} ${count}`).join(' · ');
      const dateRange = source.dates.length ? `${source.dates.sort()[0]} 至 ${source.dates.sort().slice(-1)[0]}` : '无固定日期';
      return `<div class="plan-source-row"><div class="plan-source-info"><strong title="${this.escape(source.name)}">${this.escape(source.name)}</strong><small>${source.count} 条 · ${this.escape(scopeSummary)} · ${this.escape(dateRange)}</small></div><button class="plan-source-delete" type="button" data-source="${this.escape(source.name)}">删除整张表</button></div>`;
    }).join('');
    list.querySelectorAll('.plan-source-delete').forEach(button => button.addEventListener('click', () => this.deleteSource(button.dataset.source)));
  },

  deleteSource(sourceFile) {
    const source = this.getSources().find(item => item.name === sourceFile);
    if (!source) return;
    if (!window.confirm(`确定删除“${sourceFile}”导入的全部 ${source.count} 条计划吗？\n对应的每日任务也会一起移除。`)) return;
    this.plans = this.plans.filter(plan => plan.sourceFile !== sourceFile);
    this.save();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (Array.isArray(tasks)) {
      SafeStore.set('tasks', JSON.stringify(tasks.filter(task => task.importSource !== sourceFile)));
    }
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
    this.render();
    this.showMessage(`已删除计划表：${sourceFile}`);
  },

  deletePlan(planId) {
    const plan = this.plans.find(item => item.id === planId);
    if (!plan || !window.confirm(`确定删除计划“${plan.title}”？`)) return;
    this.plans = this.plans.filter(item => item.id !== planId);
    this.save();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (Array.isArray(tasks)) SafeStore.set('tasks', JSON.stringify(tasks.filter(task => task.planId !== planId)));
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
    this.render();
    this.showMessage('计划已删除');
  },

  commitPending() {
    if (!this.pending?.plans?.length) return;
    const fileName = this.pending.fileName;
    this.plans = this.plans.filter(plan => plan.sourceFile !== fileName);
    const imported = this.pending.plans;
    const subjectByCategory = category => {
      if (typeof SubjectManager === 'undefined') return { subjectId: '', subject: '', subjectName: '' };
      const match = SubjectManager.subjects.find(item => item.name === category);
      if (match) return { subjectId: match.id, subject: match.name, subjectName: match.name };
      return { subjectId: '', subject: category || '', subjectName: category || '' };
    };
    this.plans.push(...imported);
    this.save();
    const importedTasks = imported.filter(plan => plan.scope === 'daily').map(plan => {
      const assigned = subjectByCategory(plan.category);
      return {
        id: `task-${plan.id}`,
        text: this.taskLabel(plan),
        details: plan.details,
        date: plan.date,
        activeFrom: plan.activeFrom,
        activeTo: plan.activeTo,
        planId: plan.id,
        importSource: fileName,
        completed: plan.completed,
        completedForDate: plan.completedForDate || '',
        recurringDaily: !plan.date,
        order: plan.manualOrder,
        createdAt: plan.createdAt,
        subjectId: assigned.subjectId,
        subject: assigned.subject,
        subjectName: assigned.subjectName,
        category: plan.category,
        categoryPath: plan.categoryPath,
        tags: plan.tags,
      };
    });
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    tasks = Array.isArray(tasks) ? tasks.filter(task => task.importSource !== fileName) : [];
    SafeStore.set('tasks', JSON.stringify([...importedTasks, ...tasks]));
    this.clearPending();
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
    this.render();
    this.showMessage(`已导入 ${imported.length} 条计划`);
  },

  visiblePlans() {
    const today = this.todayKey();
    const now = new Date();
    const currentWeek = this.weekOfYear(now);
    const weeklyPlans = this.plans.filter(plan => plan.scope === 'weekly');
    const matchingWeekly = weeklyPlans.filter(plan => this.weekNumber(plan.week) === currentWeek || this.isDateInCurrentWeek(plan.date, now));
    return this.plans.filter(plan => {
      if (this.activeScope === 'all') return true;
      if (this.activeScope === 'daily') return plan.scope === 'daily' && ((!plan.date && this.stageApplicable(plan.stage, today)) || plan.date === today);
      if (this.activeScope === 'weekly') {
        if (plan.scope !== 'weekly') return false;
        // Prefer the current week, but never hide an imported weekly plan when its
        // source uses a different week-numbering convention.
        return matchingWeekly.length === 0 || !plan.week || this.weekNumber(plan.week) === currentWeek || this.isDateInCurrentWeek(plan.date, now) || (plan.weekday && plan.weekday === ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]);
      }
      if (this.activeScope === 'monthly') return plan.scope === 'monthly' && (!plan.month || plan.month === today.slice(0, 7));
      return plan.scope === 'reading';
    }).sort((a, b) => {
      if (Number.isFinite(a.manualOrder) || Number.isFinite(b.manualOrder)) return (a.manualOrder ?? 9999) - (b.manualOrder ?? 9999);
      const aTime = a.scheduleTime || '99:99';
      const bTime = b.scheduleTime || '99:99';
      return aTime.localeCompare(bTime) || a.createdAt - b.createdAt;
    });
  },

  weekOfYear(date) {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(target.getFullYear(), 0, 1);
    return Math.ceil((((target - start) / 86400000) + start.getDay() + 1) / 7);
  },

  weekNumber(value) {
    const match = this.text(value).match(/\d+/);
    return match ? Number(match[0]) : null;
  },

  isDateInCurrentWeek(value, date = new Date()) {
    if (!value) return false;
    const parsed = new Date(`${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    const key = this.calendarKey(parsed);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return key >= this.calendarKey(start) && key <= this.calendarKey(end);
  },

  render() {
    const plans = this.visiblePlans();
    const labels = { daily: '今日计划', weekly: '本周计划', monthly: '本月计划', reading: '阅读计划', all: '全部计划' };
    document.getElementById('plan-view-title').textContent = labels[this.activeScope];
    const completed = plans.filter(plan => plan.completed).length;
    const progressRate = plans.length ? Math.round(completed / plans.length * 100) : 0;
    document.getElementById('plan-progress-text').textContent = `${completed} / ${plans.length} · ${progressRate}%`;
    const carryButton = document.getElementById('btn-carry-forward');
    const incompleteToday = this.plans.filter(plan => plan.scope === 'daily' && plan.date === this.todayKey() && !plan.completed).length;
    carryButton.classList.toggle('hidden', this.activeScope !== 'daily' || incompleteToday === 0);
    carryButton.textContent = `顺延未完成 (${incompleteToday})`;
    this.renderSources();
    this.renderWeeklyPreview();
    this.renderScopeSummary();
    const conflicts = this.findConflicts(plans);
    this.renderTimeline(plans, conflicts);
    this.renderTimeGrid(plans, conflicts);
    const list = document.getElementById('plan-list');
    if (!plans.length) {
      list.innerHTML = '<div class="plan-empty"><span>🗂️</span><strong>还没有这类计划</strong><small>点击上方导入按钮，选择你的学习计划表</small></div>';
      return;
    }
    list.innerHTML = plans.slice(0, 300).map(plan => `<article class="plan-item${plan.completed ? ' completed' : ''}${conflicts.has(plan.id) ? ' conflict' : ''}" data-plan-id="${plan.id}" draggable="true"><button class="plan-check" type="button" aria-label="${plan.completed ? '标记未完成' : '标记完成'}">${plan.completed ? '✓' : ''}</button><div class="plan-item-main"><strong>${this.escape(plan.title)}</strong><p>${this.escape(plan.details)}</p><div class="plan-meta"><span>${this.scopeLabel(plan.scope)}</span>${this.scheduleLabel(plan) ? `<span>${this.escape(this.scheduleLabel(plan))}</span>` : ''}${plan.timeSlot ? `<span>${this.escape(plan.timeSlot)}</span>` : ''}${plan.date ? `<span>${plan.date}</span>` : ''}${plan.week ? `<span>第 ${this.escape(plan.week)} 周</span>` : ''}${conflicts.has(plan.id) ? '<b class="plan-conflict">⚠ 时间冲突</b>' : ''}</div></div><button class="plan-item-delete text-btn danger" type="button">删除</button></article>`).join('');
    list.querySelectorAll('.plan-item').forEach(item => item.querySelector('.plan-check').addEventListener('click', () => this.toggle(item.dataset.planId)));
    list.querySelectorAll('.plan-item-delete').forEach(button => button.addEventListener('click', event => this.deletePlan(event.currentTarget.closest('.plan-item').dataset.planId)));
    this.bindDragAndDrop(list, plans);
  },

  renderWeeklyPreview() {
    const target = document.getElementById('weekly-plan-preview');
    if (!target) return;
    const plans = this.plans.filter(plan => plan.scope === 'weekly');
    if (!plans.length) { target.innerHTML = '<span>尚未导入每周计划</span>'; return; }
    const completed = plans.filter(plan => plan.completed).length;
    target.innerHTML = `<small class="weekly-plan-rate">已完成 ${completed}/${plans.length} · ${Math.round(completed / plans.length * 100)}%</small>` + plans.slice(0, 5).map(plan => `<div><strong>${plan.completed ? '✓ ' : ''}${this.escape(plan.title)}</strong><small>${this.escape(plan.weekday || (plan.week ? `第${plan.week}周` : '每周'))}${plan.scheduleTime ? ` · ${this.escape(plan.scheduleTime)}` : ''}</small></div>`).join('') + (plans.length > 5 ? `<em>还有 ${plans.length - 5} 项</em>` : '');
  },

  renderScopeSummary() {
    const target = document.getElementById('plan-scope-summary');
    if (!target) return;
    const labels = { daily: '今日', weekly: '本周', monthly: '本月' };
    target.innerHTML = Object.entries(labels).map(([scope, label]) => {
      const plans = this.visiblePlansForScope(scope);
      const completed = plans.filter(plan => plan.completed).length;
      const rate = plans.length ? Math.round(completed / plans.length * 100) : 0;
      return `<button type="button" class="plan-scope-card${this.activeScope === scope ? ' active' : ''}" data-scope-jump="${scope}"><strong>${label}</strong><span>${completed}/${plans.length}</span><i style="width:${rate}%"></i></button>`;
    }).join('');
    target.querySelectorAll('[data-scope-jump]').forEach(button => button.addEventListener('click', () => document.querySelector(`.plan-tab[data-scope="${button.dataset.scopeJump}"]`)?.click()));
  },

  visiblePlansForScope(scope) {
    const previous = this.activeScope;
    this.activeScope = scope;
    const result = this.visiblePlans();
    this.activeScope = previous;
    return result;
  },

  renderTimeline(plans, conflicts) {
    const timeline = document.getElementById('day-timeline');
    if (this.activeScope !== 'daily') { timeline.classList.add('hidden'); return; }
    timeline.classList.remove('hidden');
    const scheduled = plans.filter(plan => plan.scheduleTime).sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime));
    const unscheduled = plans.filter(plan => !plan.scheduleTime).length;
    timeline.innerHTML = scheduled.map(plan => `<div class="timeline-card${conflicts.has(plan.id) ? ' conflict' : ''}"><div class="timeline-time">${this.escape(plan.scheduleTime)}</div><div class="timeline-line"></div><div class="timeline-body"><strong>${this.escape(plan.title)}</strong><small>${plan.durationMinutes ? `预计 ${plan.durationMinutes} 分钟` : '时长待补充'}${conflicts.has(plan.id) ? ' · ⚠ 与其他任务重叠' : ''}</small></div></div>`).join('') + (unscheduled ? `<div class="timeline-empty">还有 ${unscheduled} 项没有明确开始时间，可拖动调整顺序。</div>` : '');
  },

  renderTimeGrid(plans, conflicts) {
    const section = document.getElementById('time-grid-section');
    const grid = document.getElementById('time-grid');
    if (this.activeScope !== 'daily') { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const selectedPlanId = document.getElementById('time-grid-plan-select').value;
    const today = this.todayKey();
    const selectablePlans = this.plans.filter(plan => plan.scope === 'daily' && !plan.completed);
    const options = ['<option value="">选择要分配的任务</option>'].concat(selectablePlans.map(plan => {
      const dateHint = plan.date && plan.date !== today ? ` · ${plan.date}` : '';
      return `<option value="${plan.id}">${this.escape(this.taskLabel(plan) + dateHint)}</option>`;
    }));
    document.getElementById('time-grid-plan-select').innerHTML = options.join('');
    if (plans.some(plan => plan.id === selectedPlanId)) document.getElementById('time-grid-plan-select').value = selectedPlanId;
    const cells = [];
    for (let index = 0; index < 48; index++) {
      const start = index * 30;
      const occupying = plans.filter(plan => {
        if (!plan.scheduleTime || !plan.durationMinutes) return false;
        const planStart = this.timeToMinutes(plan.scheduleTime);
        return planStart !== null && start >= planStart && start < planStart + plan.durationMinutes;
      });
      const classes = ['time-cell'];
      if (occupying.length) classes.push('occupied');
      if (occupying.some(plan => conflicts.has(plan.id))) classes.push('conflict');
      if (this.gridStart !== null && this.gridEnd !== null && index >= Math.min(this.gridStart, this.gridEnd) && index <= Math.max(this.gridStart, this.gridEnd)) classes.push('selected');
      const title = occupying.length ? occupying.map(plan => `${plan.title} (${this.scheduleLabel(plan)})`).join('；') : `${this.formatTime(start)} 可用`;
      cells.push(`<div class="${classes.join(' ')}" data-index="${index}" data-label="${index % 4 === 0 ? this.formatTime(start) : ''}" title="${this.escape(title)}"></div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.time-cell').forEach(cell => {
      cell.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.gridSelecting = true;
        this.gridStart = Number(cell.dataset.index);
        this.gridEnd = this.gridStart;
        this.paintGridSelection();
      });
      cell.addEventListener('pointerenter', () => {
        if (!this.gridSelecting) return;
        this.gridEnd = Number(cell.dataset.index);
        this.paintGridSelection();
      });
    });
    this.updateGridSelectionLabel();
  },

  paintGridSelection() {
    const min = this.gridStart === null || this.gridEnd === null ? -1 : Math.min(this.gridStart, this.gridEnd);
    const max = this.gridStart === null || this.gridEnd === null ? -1 : Math.max(this.gridStart, this.gridEnd);
    document.querySelectorAll('#time-grid .time-cell').forEach(cell => {
      const index = Number(cell.dataset.index);
      cell.classList.toggle('selected', index >= min && index <= max);
    });
    this.updateGridSelectionLabel();
  },

  updateGridSelectionLabel() {
    const label = document.getElementById('time-grid-selection-label');
    if (this.gridStart === null || this.gridEnd === null) { label.textContent = '未选择'; return; }
    const first = Math.min(this.gridStart, this.gridEnd) * 30;
    const last = (Math.max(this.gridStart, this.gridEnd) + 1) * 30;
    label.textContent = `${this.formatTime(first)}–${this.formatTime(last)} · ${(last - first)} 分钟`;
  },

  assignTimeGrid() {
    if (this.gridStart === null || this.gridEnd === null) { this.showError('请先在48格中拖动选择时间'); return; }
    const planId = document.getElementById('time-grid-plan-select').value;
    const plan = this.plans.find(item => item.id === planId);
    if (!plan) { this.showError('请先选择要分配的任务'); return; }
    const first = Math.min(this.gridStart, this.gridEnd) * 30;
    const duration = (Math.abs(this.gridEnd - this.gridStart) + 1) * 30;
    const selectedStart = first;
    const selectedEnd = first + duration;
    const today = this.todayKey();
    const overlap = this.plans.some(item => item.id !== planId && item.scope === 'daily' && (!item.date || item.date === today) && item.scheduleTime && item.durationMinutes && (() => {
      const start = this.timeToMinutes(item.scheduleTime);
      return start < selectedEnd && start + item.durationMinutes > selectedStart;
    })());
    if (overlap && !window.confirm('这段时间已有其他任务，仍要分配吗？保存后会显示时间冲突。')) return;
    if (plan.date !== today) {
      plan.originalDate = plan.originalDate || plan.date;
      plan.date = today;
    }
    plan.scheduleTime = this.formatTime(selectedStart);
    plan.durationMinutes = duration;
    plan.manualOrder = undefined;
    this.save();
    this.syncTaskForPlan(plan);
    this.gridStart = null;
    this.gridEnd = null;
    this.render();
    this.showMessage(`已安排：${this.taskLabel(plan)}`);
  },

  syncTaskForPlan(plan) {
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (!Array.isArray(tasks)) return;
    const task = tasks.find(item => item.planId === plan.id);
    if (task) { task.text = this.taskLabel(plan); task.date = plan.date; task.activeFrom = plan.activeFrom; task.activeTo = plan.activeTo; SafeStore.set('tasks', JSON.stringify(tasks)); }
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
  },

  bindDragAndDrop(list, plans) {
    list.querySelectorAll('.plan-item').forEach(item => {
      item.addEventListener('dragstart', () => { this.draggedPlanId = item.dataset.planId; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => { this.draggedPlanId = null; item.classList.remove('dragging'); });
      item.addEventListener('dragover', event => event.preventDefault());
      item.addEventListener('drop', event => {
        event.preventDefault();
        if (!this.draggedPlanId || this.draggedPlanId === item.dataset.planId) return;
        this.reorderPlans(this.draggedPlanId, item.dataset.planId, plans);
      });
    });
  },

  reorderPlans(sourceId, targetId, visiblePlans) {
    const ids = visiblePlans.map(plan => plan.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    ids.forEach((id, index) => {
      const plan = this.plans.find(item => item.id === id);
      if (plan) plan.manualOrder = index;
    });
    this.save();
    this.syncTaskOrder(ids);
    this.render();
    this.showMessage('计划顺序已调整');
  },

  syncTaskOrder(planIds) {
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (!Array.isArray(tasks)) return;
    tasks.forEach(task => {
      const index = planIds.indexOf(task.planId);
      if (index >= 0) task.order = index;
    });
    SafeStore.set('tasks', JSON.stringify(tasks));
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
  },

  carryForwardIncomplete() {
    const today = this.todayKey();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = this.todayKey(tomorrowDate);
    const plans = this.plans.filter(plan => plan.scope === 'daily' && plan.date === today && !plan.completed);
    if (!plans.length) return;
    if (!window.confirm(`将今天未完成的 ${plans.length} 项计划顺延到 ${tomorrow} 吗？`)) return;
    const ids = new Set(plans.map(plan => plan.id));
    plans.forEach(plan => { plan.originalDate = plan.originalDate || plan.date; plan.date = tomorrow; });
    this.save();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    if (Array.isArray(tasks)) {
      tasks.forEach(task => { if (ids.has(task.planId)) task.date = tomorrow; });
      SafeStore.set('tasks', JSON.stringify(tasks));
    }
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
    this.render();
    this.showMessage(`已将 ${plans.length} 项顺延到明天`);
  },

  toggle(id) {
    const plan = this.plans.find(item => item.id === id);
    if (!plan) return;
    plan.completed = !plan.completed;
    if (plan.scope === 'daily' && !plan.date) plan.completedForDate = plan.completed ? this.todayKey() : '';
    this.save();
    let tasks = [];
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    const task = Array.isArray(tasks) ? tasks.find(item => item.planId === id) : null;
    if (task) { task.completed = plan.completed; SafeStore.set('tasks', JSON.stringify(tasks)); }
    if (typeof TaskManager !== 'undefined') { TaskManager.loadTasks(); TaskManager.render(); }
    this.render();
  },

  syncFromTask(planId, completed) {
    const plan = this.plans.find(item => item.id === planId);
    if (!plan) return;
    plan.completed = completed;
    if (plan.scope === 'daily' && !plan.date) plan.completedForDate = completed ? this.todayKey() : '';
    this.save();
    if (document.getElementById('plans-modal').classList.contains('active')) this.render();
  },

  scopeLabel(scope) { return ({ daily: '每日', weekly: '每周', monthly: '月度', reading: '阅读' })[scope] || '计划'; },
  escape(value) { return this.text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); },
  showMessage(message) { if (typeof App !== 'undefined') App.showToast(`✅ ${message}`); },
  showError(message) { if (typeof App !== 'undefined') App.showToast(`⚠️ ${message}`); },
};
