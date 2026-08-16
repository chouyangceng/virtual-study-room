/* Unified today tasks and daily habits. Pomodoro sessions bind to task ids. */
const TaskManager = {
  tasks: [],
  categoryFilter: '',

  init() {
    this.loadTasks();
    this.bindUI();
    this.refreshDailyState();
    this.render();
  },

  loadTasks() {
    try {
      const stored = JSON.parse(localStorage.getItem('tasks') || '[]');
      this.tasks = Array.isArray(stored) ? stored.map(task => this.normalizeTask(task)) : [];
    } catch (error) {
      this.tasks = [];
    }
    this.saveTasks();
  },

  normalizeTask(task) {
    const kind = task.kind === 'habit' || task.recurringDaily ? 'habit' : 'today';
    const completedDates = Array.isArray(task.completedDates) ? [...new Set(task.completedDates.filter(Boolean))] : [];
    if (kind === 'habit' && task.completed && task.completedForDate && !completedDates.includes(task.completedForDate)) {
      completedDates.push(task.completedForDate);
    }
    return {
      ...task,
      id: String(task.id || this.createId()),
      text: String(task.text || task.title || '').trim(),
      kind,
      recurringDaily: kind === 'habit',
      date: kind === 'habit' ? '' : (task.date || this.getTodayKey()),
      completed: Boolean(task.completed),
      completedForDate: task.completedForDate || '',
      completedDates: completedDates.sort(),
      completedPomodoros: Math.max(0, Number(task.completedPomodoros) || 0),
      createdAt: Number(task.createdAt) || Date.now(),
      categoryPath: String(task.categoryPath || task.category || task.subjectName || task.subject || '').replace(/^未分类$/, ''),
      tags: Array.isArray(task.tags) ? task.tags : [],
    };
  },

  createId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },

  saveTasks() {
    SafeStore.set('tasks', JSON.stringify(this.tasks));
  },

  getTodayKey() {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey() : this.calendarKey();
  },

  calendarKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  shiftDateKey(key, days) {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + days);
    return this.calendarKey(date);
  },

  refreshDailyState() {
    const today = this.getTodayKey();
    let changed = false;
    this.tasks.forEach(task => {
      if (task.kind !== 'habit') return;
      const completedToday = task.completedDates.includes(today);
      if (task.completed !== completedToday || task.completedForDate !== today) {
        task.completed = completedToday;
        task.completedForDate = today;
        task.completedAt = completedToday ? task.completedAt : null;
        changed = true;
      }
    });
    if (changed) this.saveTasks();
    return changed;
  },

  getVisibleTasks() {
    const today = this.getTodayKey();
    return this.tasks.filter(task => {
      if (task.kind === 'habit') return !task.archived;
      if (task.date && task.date !== today) return false;
      if (task.activeFrom && today < task.activeFrom) return false;
      if (task.activeTo && today > task.activeTo) return false;
      return true;
    });
  },

  getTaskById(id) {
    return this.tasks.find(task => task.id === id) || null;
  },

  bindUI() {
    const input = document.getElementById('task-input');
    input?.addEventListener('keydown', event => {
      if (event.key === 'Enter') this.addTask();
    });
    document.getElementById('btn-add-task')?.addEventListener('click', () => this.addTask());
    document.getElementById('btn-clear-completed')?.addEventListener('click', () => this.clearCompleted());
    document.getElementById('task-category-filter')?.addEventListener('change', event => {
      this.categoryFilter = event.target.value;
      this.render();
    });
    document.getElementById('btn-new-timer-task')?.addEventListener('click', () => {
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  },

  addTask(textOverride = '', options = {}) {
    const input = document.getElementById('task-input');
    const text = String(textOverride || input?.value || '').trim();
    if (!text) return null;
    const kind = options.kind === 'habit' || (!textOverride && document.getElementById('task-kind')?.value === 'habit') ? 'habit' : 'today';
    const task = this.normalizeTask({
      ...options,
      id: options.id || this.createId(),
      text,
      kind,
      completed: Boolean(options.completed),
      completedForDate: options.completedForDate || '',
      completedDates: options.completedDates || [],
      createdAt: options.createdAt || Date.now(),
      date: kind === 'habit' ? '' : (options.date || this.getTodayKey()),
      planId: options.planId,
      sourceFile: options.sourceFile,
      categoryPath: options.categoryPath ?? document.getElementById('task-category-path')?.value.trim().replace(/\s*[>＞\\]+\s*/g, '/').replace(/^\/+|\/+$/g, ''),
      tags: options.tags ?? String(document.getElementById('task-tags')?.value || '').split(/[,，#]+/).map(tag => tag.trim()).filter(Boolean).slice(0, 12),
    });
    if (!this.tasks.some(item => item.id === task.id || (item.planId && item.planId === task.planId))) this.tasks.unshift(task);
    if (!textOverride && input) input.value = '';
    if (!textOverride && document.getElementById('task-tags')) document.getElementById('task-tags').value = '';
    this.saveTasks();
    this.render();
    input?.focus();
    return task;
  },

  addDatedTask(text, date, options = {}) {
    return this.addTask(text, {
      kind: 'today',
      date,
      categoryPath: '',
      tags: [],
      ...options,
    });
  },

  importTasks(items) {
    let added = 0;
    items.forEach(item => {
      const task = this.normalizeTask({ ...item, id: item.id || this.createId() });
      const duplicate = this.tasks.some(existing => existing.id === task.id
        || (task.planId && existing.planId === task.planId)
        || (task.sourceFile && existing.sourceFile === task.sourceFile && existing.kind === task.kind && existing.date === task.date && existing.text === task.text));
      if (!duplicate) { this.tasks.unshift(task); added += 1; }
    });
    if (added) { this.saveTasks(); this.render(); }
    return added;
  },

  deleteBySource(sourceFile) {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter(task => task.sourceFile !== sourceFile);
    const removed = before - this.tasks.length;
    if (removed) { this.saveTasks(); this.render(); }
    return removed;
  },

  syncReviewReminders(sourceDate, targetDate, lines) {
    const normalizedLines = [...new Set((Array.isArray(lines) ? lines : [])
      .map(line => String(line || '').trim())
      .filter(Boolean))];
    this.tasks = this.tasks.filter(task => task.reviewReminderSourceDate !== sourceDate);
    const generated = normalizedLines.map((text, index) => this.normalizeTask({
      id: this.createId(),
      text,
      kind: 'today',
      date: targetDate,
      sourceFile: '每日复盘提醒',
      reviewReminderSourceDate: sourceDate,
      reminderOrder: index,
      createdAt: Date.now() + index,
    }));
    this.tasks = [...generated, ...this.tasks];
    this.saveTasks();
    this.render();
    return generated;
  },

  toggleTask(id) {
    const task = this.getTaskById(id);
    if (!task) return;
    const today = this.getTodayKey();
    if (task.kind === 'habit') {
      const completedToday = task.completedDates.includes(today);
      task.completedDates = completedToday ? task.completedDates.filter(date => date !== today) : [...task.completedDates, today].sort();
      task.completed = !completedToday;
      task.completedForDate = today;
    } else {
      task.completed = !task.completed;
    }
    if (task.completed) task.completedAt = Date.now();
    else {
      delete task.completedAt;
      if (localStorage.getItem('dayClosePromptedDate') === today) SafeStore.remove('dayClosePromptedDate');
    }
    this.saveTasks();
    this.render();
    if (task.planId && typeof PlanManager !== 'undefined') PlanManager.syncFromTask?.(task.planId, task.completed);
    if (task.completed && typeof ReviewManager !== 'undefined') ReviewManager.onTaskCompleted(task);
    if (task.completed && typeof App !== 'undefined') App.checkAchievements();
  },

  recordPomodoro(id, durationMinutes) {
    const task = this.getTaskById(id);
    if (!task) return;
    task.completedPomodoros = (Number(task.completedPomodoros) || 0) + 1;
    task.focusMinutes = (Number(task.focusMinutes) || 0) + Math.max(1, Number(durationMinutes) || 0);
    task.lastFocusedAt = Date.now();
    this.saveTasks();
    this.render();
  },

  deleteTask(id) {
    const task = this.getTaskById(id);
    if (!task || !window.confirm(`删除任务「${task.text}」？`)) return;
    this.tasks = this.tasks.filter(item => item.id !== id);
    this.saveTasks();
    this.render();
  },

  clearCompleted() {
    const removable = new Set(this.getVisibleTasks().filter(task => task.kind !== 'habit' && task.completed).map(task => task.id));
    if (!removable.size) return;
    this.tasks = this.tasks.filter(task => !removable.has(task.id));
    this.saveTasks();
    this.render();
  },

  getActiveCount() {
    return this.getVisibleTasks().filter(task => !task.completed).length;
  },

  getCompletedCount() {
    return this.getVisibleTasks().filter(task => task.kind !== 'habit' && task.completed).length;
  },

  getHabitStreak(task) {
    if (!task || task.kind !== 'habit') return 0;
    const completed = new Set(task.completedDates || []);
    let cursor = this.getTodayKey();
    if (!completed.has(cursor)) cursor = this.shiftDateKey(cursor, -1);
    let streak = 0;
    while (completed.has(cursor) && streak < 10000) {
      streak += 1;
      cursor = this.shiftDateKey(cursor, -1);
    }
    return streak;
  },

  render() {
    const list = document.getElementById('task-list');
    if (!list) return;
    const visible = this.getVisibleTasks();
    this.renderCategoryFilter(visible);
    const sorted = visible
      .filter(task => !this.categoryFilter || (task.categoryPath || '').startsWith(this.categoryFilter))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'habit' ? -1 : 1;
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (Number.isFinite(a.order) || Number.isFinite(b.order)) return (a.order ?? 9999) - (b.order ?? 9999);
        return b.createdAt - a.createdAt;
      });
    list.innerHTML = '';
    if (!sorted.length) {
      const empty = document.createElement('li');
      empty.className = 'task-empty';
      empty.textContent = '今天暂无任务，先添加一件要完成的事吧';
      list.appendChild(empty);
    }
    sorted.forEach(task => list.appendChild(this.createTaskRow(task)));
    document.getElementById('task-count').textContent = this.getActiveCount();
    document.getElementById('btn-clear-completed')?.classList.toggle('hidden', this.getCompletedCount() === 0);
    this.renderTimerTaskSelect();
  },

  createTaskRow(task) {
    const li = document.createElement('li');
    li.className = `task-item ${task.kind === 'habit' ? 'habit-task' : 'today-task'}${task.completed ? ' completed' : ''}`;
    li.dataset.taskId = task.id;
    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'task-checkbox';
    checkbox.setAttribute('aria-label', task.completed ? '标记为未完成' : '标记为已完成');
    checkbox.textContent = task.completed ? '✓' : '';
    checkbox.addEventListener('click', () => this.toggleTask(task.id));
    const content = document.createElement('span');
    content.className = 'task-text';
    content.append(document.createTextNode(task.text));
    const badges = document.createElement('small');
    badges.className = 'task-taxonomy';
    const type = document.createElement('b');
    type.className = task.kind === 'habit' ? 'habit-badge' : 'today-badge';
    type.textContent = task.kind === 'habit' ? `每日坚持 · ${this.getHabitStreak(task)} 天` : '今日任务';
    badges.appendChild(type);
    if (task.categoryPath) badges.append(document.createTextNode(task.categoryPath));
    (task.tags || []).forEach(tag => { const badge = document.createElement('b'); badge.textContent = `#${tag}`; badges.appendChild(badge); });
    if (task.completedPomodoros) {
      const focus = document.createElement('b');
      focus.textContent = `${task.completedPomodoros} 个番茄`;
      badges.appendChild(focus);
    }
    content.appendChild(badges);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'task-delete';
    del.setAttribute('aria-label', `删除${task.text}`);
    del.textContent = '×';
    del.addEventListener('click', () => this.deleteTask(task.id));
    li.append(checkbox, content, del);
    return li;
  },

  renderTimerTaskSelect() {
    const select = document.getElementById('session-task-select');
    if (!select) return;
    const current = select.value;
    const tasks = this.getVisibleTasks().filter(task => !task.completed);
    select.innerHTML = '<option value="">选择今日要专注的任务</option>' + tasks.map(task => {
      const prefix = task.kind === 'habit' ? '每日坚持' : '今日任务';
      return `<option value="${this.escape(task.id)}">${prefix} · ${this.escape(task.text)}</option>`;
    }).join('');
    if (tasks.some(task => task.id === current)) select.value = current;
  },

  renderCategoryFilter(tasks) {
    const select = document.getElementById('task-category-filter');
    if (!select) return;
    const paths = [...new Set(tasks.flatMap(task => {
      const parts = (task.categoryPath || '').split('/').map(part => part.trim()).filter(Boolean);
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    }))].sort();
    select.innerHTML = '<option value="">全部分类</option>' + paths.map(path => `<option value="${this.escape(path)}">${this.escape(path)}</option>`).join('');
    if (paths.includes(this.categoryFilter)) select.value = this.categoryFilter;
    else this.categoryFilter = '';
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },
};
