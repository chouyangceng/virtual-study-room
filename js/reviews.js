/* ============================================
   reviews.js - Pomodoro, task and daily review workflow
   ============================================ */

const ReviewManager = {
  reviews: [],
  sessionReviews: [],
  dailyCloses: [],
  deepseekSettings: {},
  pendingTask: null,
  pendingSession: null,
  sessionReviewDone: null,
  currentHistoryDate: '',
  calendarMonth: '',

  init() {
    this.load();
    const sessionModal = document.getElementById('session-review-modal');
    const taskModal = document.getElementById('task-review-modal');
    const dailyModal = document.getElementById('reviews-modal');
    const closeModal = document.getElementById('daily-close-modal');

    document.getElementById('btn-reviews')?.addEventListener('click', () => this.openDaily());
    sessionModal?.querySelector('.modal-close')?.addEventListener('click', () => this.closeSessionReview(true));
    sessionModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeSessionReview(true));
    document.getElementById('btn-save-session-review')?.addEventListener('click', () => this.savePendingSessionReview());
    document.getElementById('btn-skip-session-review')?.addEventListener('click', () => this.closeSessionReview(true));

    taskModal?.querySelector('.modal-close')?.addEventListener('click', () => this.closeTaskReview(true));
    taskModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeTaskReview(true));
    document.getElementById('btn-save-review')?.addEventListener('click', () => this.savePendingReview());
    document.getElementById('btn-skip-review')?.addEventListener('click', () => this.closeTaskReview(true));

    dailyModal?.querySelector('.modal-close')?.addEventListener('click', () => this.closeDaily());
    dailyModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeDaily());
    document.getElementById('btn-export-review-md')?.addEventListener('click', () => this.export('markdown'));
    document.getElementById('btn-export-review-json')?.addEventListener('click', () => this.export('json'));
    document.getElementById('btn-open-day-close')?.addEventListener('click', () => this.openDayClose(false));
    document.querySelectorAll('[data-review-tab]').forEach(button => button.addEventListener('click', () => this.setReviewTab(button.dataset.reviewTab)));

    closeModal?.querySelector('.modal-close')?.addEventListener('click', () => this.closeDayClose());
    closeModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeDayClose());
    document.getElementById('btn-save-day-close')?.addEventListener('click', () => this.saveDayClose());
    document.getElementById('btn-export-day-close')?.addEventListener('click', () => this.exportDayClose());
    document.getElementById('btn-save-deepseek-settings')?.addEventListener('click', () => this.saveDeepseekSettings());
    document.getElementById('btn-deepseek-analyze')?.addEventListener('click', () => this.analyzeWithDeepSeek());

    document.getElementById('review-calendar-prev')?.addEventListener('click', () => this.shiftCalendarMonth(-1));
    document.getElementById('review-calendar-next')?.addEventListener('click', () => this.shiftCalendarMonth(1));
    document.getElementById('review-calendar-today')?.addEventListener('click', () => {
      this.calendarMonth = this.todayKey().slice(0, 7) + '-01';
      this.currentHistoryDate = this.todayKey();
      this.renderHistory();
    });
    document.getElementById('review-calendar-month')?.addEventListener('change', event => {
      if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
      this.selectCalendarMonth(`${event.target.value}-01`);
    });
    this.fillDeepseekSettings();
  },

  load() {
    this.reviews = this.readArray('dailyReviews');
    this.sessionReviews = this.readArray('sessionReviews');
    this.dailyCloses = this.readArray('dailyCloseEntries');
    try { this.deepseekSettings = JSON.parse(localStorage.getItem('deepseekSettings') || '{}') || {}; }
    catch (error) { this.deepseekSettings = {}; }
    if (!this.calendarMonth) this.calendarMonth = this.todayKey().slice(0, 7) + '-01';
  },

  readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  },

  save() {
    SafeStore.set('dailyReviews', JSON.stringify(this.reviews));
    SafeStore.set('sessionReviews', JSON.stringify(this.sessionReviews));
  },

  todayKey(date = new Date()) {
    return typeof App !== 'undefined' && App.getStudyDateKey
      ? App.getStudyDateKey(date)
      : this.calendarKey(date);
  },

  calendarKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  dateFromKey(key) { return new Date(`${key}T12:00:00`); },
  shiftDateKey(key, days) {
    const date = this.dateFromKey(key);
    date.setDate(date.getDate() + days);
    return this.calendarKey(date);
  },
  createId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); },
  hasText(value) { return Boolean(String(value || '').trim()); },
  releaseBodyScroll() {
    if (!document.querySelector('.modal.active')) document.body.style.overflow = '';
  },

  getSessionsForDate(date) {
    return this.readArray('focusSessions')
      .filter(session => session.date === date && (session.type || 'work') === 'work')
      .sort((a, b) => (Number(a.startedAt) || Number(a.timestamp) || 0) - (Number(b.startedAt) || Number(b.timestamp) || 0));
  },

  getSessionReview(sessionId) {
    return this.sessionReviews.find(review => review.sessionId === sessionId) || null;
  },

  getSessionReviewsForDate(date) {
    const current = this.sessionReviews.filter(review => review.date === date);
    const snapshot = this.getDayClose(date)?.sessionReviewsSnapshot;
    const merged = new Map((Array.isArray(snapshot) ? snapshot : []).map(review => [review.sessionId || review.id, review]));
    current.forEach(review => merged.set(review.sessionId || review.id, review));
    return [...merged.values()];
  },

  openForSession(session, onDone = null) {
    if (!session) { if (onDone) onDone(); return; }
    const existing = this.getSessionReview(session.id)
      || this.getSessionReviewsForDate(session.date || this.todayKey()).find(review => review.sessionId === session.id);
    this.pendingSession = { ...session };
    this.sessionReviewDone = typeof onDone === 'function' ? onDone : null;
    document.getElementById('session-review-task-name').textContent = `${session.sessionName || '本次专注'} · ${Number(session.duration) || 0} 分钟`;
    document.getElementById('session-review-note').value = existing?.sessionNote || session.sessionNote || '';
    document.getElementById('session-review-result').value = existing?.result || '';
    document.getElementById('session-review-difficulty').value = existing?.difficulty || '';
    document.getElementById('session-review-next').value = existing?.nextAction || '';
    document.getElementById('btn-save-session-review').textContent = existing ? '更新并关闭' : '保存并休息';
    document.getElementById('session-review-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('session-review-result')?.focus(), 50);
  },

  closeSessionReview(skipped = false) {
    const done = this.sessionReviewDone;
    document.getElementById('session-review-modal').classList.remove('active');
    this.pendingSession = null;
    this.sessionReviewDone = null;
    document.getElementById('btn-save-session-review').textContent = '保存并休息';
    this.releaseBodyScroll();
    if (skipped && typeof App !== 'undefined') App.showToast('已跳过本次复盘，专注记录仍已保存');
    if (done) done();
  },

  savePendingSessionReview() {
    if (!this.pendingSession) return;
    const session = this.pendingSession;
    const fields = {
      sessionNote: document.getElementById('session-review-note').value.trim(),
      result: document.getElementById('session-review-result').value.trim(),
      difficulty: document.getElementById('session-review-difficulty').value,
      nextAction: document.getElementById('session-review-next').value.trim(),
    };
    const existing = this.getSessionReview(session.id)
      || this.getSessionReviewsForDate(session.date || this.todayKey()).find(review => review.sessionId === session.id);
    this.sessionReviews = this.sessionReviews.filter(item => item.sessionId !== session.id);
    if (Object.values(fields).some(value => this.hasText(value))) {
      const savedReview = {
        id: existing?.id || this.createId('session-review'),
        sessionId: session.id,
        taskId: session.taskId || '',
        date: session.date || this.todayKey(),
        taskTitle: session.sessionName || '未命名任务',
        duration: Number(session.duration) || 0,
        ...fields,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      this.sessionReviews.unshift(savedReview);
      this.syncReviewSnapshot('sessionReviewsSnapshot', savedReview, 'sessionId');
      this.save();
      if (typeof App !== 'undefined') App.showToast('本次专注复盘已保存');
    } else {
      this.save();
    }
    this.closeSessionReview(false);
    this.refreshOpenReviewCenter();
  },

  deleteSessionReview(reviewId) {
    const review = this.sessionReviews.find(item => item.id === reviewId);
    if (!review || !window.confirm('删除这条番茄钟复盘？专注时长记录会保留。')) return;
    this.sessionReviews = this.sessionReviews.filter(item => item.id !== reviewId);
    this.removeReviewFromSnapshot('sessionReviewsSnapshot', review, 'sessionId');
    this.save();
    this.renderDaily();
    this.renderHistory();
  },

  getReviewForTask(taskId, date = this.todayKey()) {
    return this.reviews.find(review => review.taskId === taskId && review.date === date) || null;
  },

  getTodayTasks() {
    if (typeof TaskManager === 'undefined') return [];
    return TaskManager.getVisibleTasks().filter(task => task.completed);
  },

  getTodayReviews() { return this.reviews.filter(review => review.date === this.todayKey()); },
  getPendingTasks() {
    const reviewed = new Set(this.getTodayReviews().map(review => review.taskId));
    return this.getTodayTasks().filter(task => !reviewed.has(task.id));
  },

  getSubjectReviewSummary(tasks = this.getTodayTasks(), reviews = this.getTodayReviews()) {
    const reviewed = new Set(reviews.map(review => review.taskId));
    const groups = {};
    tasks.forEach(task => {
      const name = task.categoryPath || task.subjectName || task.subject || task.category || '未分类';
      if (!groups[name]) groups[name] = { total: 0, reviewed: 0 };
      groups[name].total += 1;
      if (reviewed.has(task.id)) groups[name].reviewed += 1;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, ...value }));
  },

  openForTask(task, reviewDate = this.todayKey()) {
    if (!task || !task.completed) return;
    const date = reviewDate || this.todayKey();
    const existing = this.getReviewForTask(task.id, date)
      || this.getReviewsForDate(date).find(review => review.taskId === task.id);
    this.pendingTask = { ...task, date };
    document.getElementById('review-task-name').textContent = `${task.text}${date === this.todayKey() ? '' : ` · ${date}`}`;
    document.getElementById('review-result').value = existing?.result || '';
    document.getElementById('review-output').value = existing?.output || '';
    document.getElementById('review-next').value = existing?.nextAction || '';
    document.getElementById('review-difficulty').value = existing?.difficulty || '';
    document.getElementById('btn-save-review').textContent = existing ? '更新复盘' : '保存复盘';
    document.getElementById('task-review-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('review-result')?.focus(), 50);
  },

  closeTaskReview(skipped = false) {
    const shouldCheckToday = this.pendingTask?.date === this.todayKey();
    document.getElementById('task-review-modal').classList.remove('active');
    this.pendingTask = null;
    document.getElementById('btn-save-review').textContent = '保存复盘';
    this.releaseBodyScroll();
    if (skipped && typeof App !== 'undefined') App.showToast('已跳过任务复盘，可稍后在复盘中心补写');
    if (shouldCheckToday) this.checkDayComplete();
  },

  savePendingReview() {
    if (!this.pendingTask) return;
    const task = this.pendingTask;
    const existing = this.getReviewForTask(task.id, task.date);
    const fields = {
      result: document.getElementById('review-result').value.trim(),
      difficulty: document.getElementById('review-difficulty').value,
      output: document.getElementById('review-output').value.trim(),
      nextAction: document.getElementById('review-next').value.trim(),
    };
    this.reviews = this.reviews.filter(item => !(item.taskId === task.id && item.date === task.date));
    if (Object.values(fields).some(value => this.hasText(value))) {
      const savedReview = {
        id: existing?.id || this.createId('review'),
        taskId: task.id,
        planId: task.planId || '',
        date: task.date,
        taskTitle: task.text,
        ...fields,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      this.reviews.unshift(savedReview);
      this.syncReviewSnapshot('reviewsSnapshot', savedReview, 'taskId');
      if (typeof App !== 'undefined') App.showToast('任务复盘已保存');
    }
    this.save();
    this.closeTaskReview(false);
    this.refreshOpenReviewCenter();
  },

  deleteReview(reviewId) {
    const review = this.reviews.find(item => item.id === reviewId);
    if (!review || !window.confirm(`删除这条复盘「${review.taskTitle}」？`)) return;
    this.reviews = this.reviews.filter(item => item.id !== reviewId);
    this.removeReviewFromSnapshot('reviewsSnapshot', review, 'taskId');
    this.save();
    this.renderDaily();
    this.renderHistory();
  },

  onTaskCompleted(task) {
    setTimeout(() => this.openForTask(task), 0);
  },

  isDayComplete() {
    if (typeof TaskManager === 'undefined') return false;
    const tasks = TaskManager.getVisibleTasks();
    return tasks.length > 0 && tasks.every(task => task.completed);
  },

  checkDayComplete() {
    if (!this.isDayComplete()) return;
    const date = this.todayKey();
    if (localStorage.getItem('dayClosePromptedDate') === date) return;
    SafeStore.set('dayClosePromptedDate', date);
    if (typeof App !== 'undefined') App.showToast('今日任务已全部完成；需要日总结时，请进入复盘中心');
  },

  syncReviewSnapshot(snapshotKey, review, identityKey) {
    const close = this.getDayClose(review.date);
    if (!close) return;
    const snapshot = Array.isArray(close[snapshotKey]) ? close[snapshotKey] : [];
    close[snapshotKey] = [review, ...snapshot.filter(item => item[identityKey] !== review[identityKey])];
    close.updatedAt = new Date().toISOString();
    SafeStore.set('dailyCloseEntries', JSON.stringify(this.dailyCloses));
  },

  removeReviewFromSnapshot(snapshotKey, review, identityKey) {
    const close = this.getDayClose(review.date);
    if (!close || !Array.isArray(close[snapshotKey])) return;
    close[snapshotKey] = close[snapshotKey].filter(item => item[identityKey] !== review[identityKey]);
    close.updatedAt = new Date().toISOString();
    SafeStore.set('dailyCloseEntries', JSON.stringify(this.dailyCloses));
  },

  refreshOpenReviewCenter() {
    if (!document.getElementById('reviews-modal')?.classList.contains('active')) return;
    this.renderDaily();
    if (!document.getElementById('review-history-panel')?.hidden) this.renderHistory();
  },

  openDaily(tab = 'today') {
    this.renderDaily();
    this.setReviewTab(tab);
    document.getElementById('reviews-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  setReviewTab(tab = 'today') {
    const isHistory = tab === 'history';
    document.querySelectorAll('[data-review-tab]').forEach(button => {
      const active = button.dataset.reviewTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.getElementById('review-today-panel').hidden = isHistory;
    document.getElementById('review-history-panel').hidden = !isHistory;
    if (isHistory) this.renderHistory();
  },

  closeDaily() {
    document.getElementById('reviews-modal').classList.remove('active');
    this.releaseBodyScroll();
  },

  sessionReviewContent(review) {
    if (!review) return '';
    const parts = [];
    if (review.sessionNote) parts.push(`<p><b>备注</b>${this.escape(review.sessionNote)}</p>`);
    if (review.result) parts.push(`<p><b>完成</b>${this.escape(review.result)}</p>`);
    if (review.difficulty) parts.push(`<span>${this.escape(review.difficulty)}</span>`);
    if (review.nextAction) parts.push(`<p><b>接续</b>${this.escape(review.nextAction)}</p>`);
    return parts.join('');
  },

  taskReviewContent(review) {
    if (!review) return '';
    return `${review.result ? `<p>${this.escape(review.result)}</p>` : ''}<div class="review-row-meta">${review.difficulty ? `<span>状态：${this.escape(review.difficulty)}</span>` : ''}${review.output ? `<span>产出：${this.escape(review.output)}</span>` : ''}${review.nextAction ? `<span>下一步：${this.escape(review.nextAction)}</span>` : ''}</div>`;
  },

  renderDaily() {
    const tasks = this.getTodayTasks();
    const sessions = this.getSessionsForDate(this.todayKey());
    const reviews = this.getTodayReviews();
    const sessionReviews = this.getSessionReviewsForDate(this.todayKey());
    const minutes = sessions.reduce((sum, session) => sum + (Number(session.duration) || 0), 0);
    const reviewCount = reviews.length + sessionReviews.length;
    document.getElementById('review-summary-completed').textContent = tasks.length;
    document.getElementById('review-summary-reviewed').textContent = reviewCount;
    document.getElementById('review-summary-minutes').textContent = minutes;
    document.getElementById('review-summary-difficulty').textContent = this.modeDifficulty([...reviews, ...sessionReviews]);
    const flow = document.querySelectorAll('.review-flow > div');
    flow[0]?.classList.toggle('done', sessions.length > 0 || tasks.length > 0);
    flow[1]?.classList.toggle('done', sessions.length > 0);
    flow[2]?.classList.toggle('done', this.isDayComplete());
    flow[3]?.classList.toggle('done', Boolean(this.getDayClose()));
    document.getElementById('review-summary-text').textContent = tasks.length || sessions.length
      ? `今日 ${sessions.length} 个番茄钟，共 ${minutes} 分钟；完成 ${tasks.length} 项任务，留下 ${reviewCount} 条可查阅复盘。`
      : '今天还没有专注或完成任务，记录会在这里自动汇总。';

    const list = document.getElementById('review-list');
    const groupedTaskIds = new Set([...tasks.map(task => task.id), ...sessions.map(session => session.taskId).filter(Boolean)]);
    const rows = [...groupedTaskIds].map(taskId => {
      const task = (typeof TaskManager !== 'undefined' ? TaskManager.getTaskById(taskId) : null)
        || tasks.find(item => item.id === taskId)
        || { id: taskId, text: sessions.find(item => item.taskId === taskId)?.sessionName || '未命名任务', completed: false };
      const taskSessions = sessions.filter(session => session.taskId === taskId);
      const taskReview = reviews.find(review => review.taskId === taskId);
      const sessionRows = taskSessions.map((session, index) => {
        const review = sessionReviews.find(item => item.sessionId === session.id);
        const content = this.sessionReviewContent(review);
        return `<article class="session-review-row" data-session-id="${this.escape(session.id)}" data-session-review-id="${this.escape(review?.id || '')}"><header><strong>番茄 ${index + 1}</strong><span>${Number(session.duration) || 0} 分钟</span></header>${session.sessionNote && !review?.sessionNote ? `<p><b>备注</b>${this.escape(session.sessionNote)}</p>` : ''}${content}<div class="session-review-actions"><button class="text-btn session-review-edit" type="button">${review ? '编辑单次复盘' : '补写单次复盘'}</button>${review ? '<button class="text-btn danger session-review-delete" type="button">删除复盘</button>' : ''}</div></article>`;
      }).join('');
      const taskReviewBlock = taskReview
        ? `<section class="task-review-block"><h5>任务完成复盘</h5>${this.taskReviewContent(taskReview)}<div class="review-row-actions"><button class="text-btn review-edit" type="button">编辑任务复盘</button><button class="text-btn danger review-delete" type="button">删除复盘</button></div></section>`
        : task.completed ? '<button class="review-fill" type="button">补写任务完成复盘</button>' : '';
      return `<article class="review-row" data-task-id="${this.escape(task.id)}" data-review-id="${this.escape(taskReview?.id || '')}"><div class="review-row-title"><strong>${this.escape(task.text)}</strong><span>${task.completed ? '任务已完成' : '专注进行中'}</span></div><div class="review-row-meta"><span>${taskSessions.length} 个番茄</span><span>${taskSessions.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)} 分钟</span></div><div class="session-review-list">${sessionRows}</div>${taskReviewBlock}</article>`;
    }).join('');
    list.innerHTML = rows || '<div class="review-empty">完成一次专注后，这里会按任务整合番茄记录。</div>';
    this.bindDailyReviewActions(list, tasks, sessions);
  },

  bindDailyReviewActions(list, tasks, sessions) {
    list.querySelectorAll('.review-fill, .review-edit').forEach(button => button.addEventListener('click', event => {
      const id = event.currentTarget.closest('.review-row').dataset.taskId;
      const task = tasks.find(item => item.id === id) || (typeof TaskManager !== 'undefined' ? TaskManager.getTaskById(id) : null);
      if (task) this.openForTask(task);
    }));
    list.querySelectorAll('.review-delete').forEach(button => button.addEventListener('click', event => this.deleteReview(event.currentTarget.closest('.review-row').dataset.reviewId)));
    list.querySelectorAll('.session-review-edit').forEach(button => button.addEventListener('click', event => {
      const session = sessions.find(item => item.id === event.currentTarget.closest('.session-review-row').dataset.sessionId);
      if (session) this.openForSession(session);
    }));
    list.querySelectorAll('.session-review-delete').forEach(button => button.addEventListener('click', event => this.deleteSessionReview(event.currentTarget.closest('.session-review-row').dataset.sessionReviewId)));
  },

  getDayClose(date = this.todayKey()) { return this.dailyCloses.find(item => item.date === date); },

  openDayClose(automatic = false) {
    this.closeDaily();
    const date = this.todayKey();
    const saved = this.getDayClose(date) || {};
    document.getElementById('day-close-date').textContent = date;
    document.getElementById('day-close-self-review').value = saved.selfReview || '';
    document.getElementById('day-close-tomorrow-tasks').value = saved.tomorrowTasks || '';
    document.getElementById('day-close-ai-output').textContent = saved.aiAnalysis || '尚未分析。填写整日复盘和明日提醒后，可选择“开始严格分析”。';
    this.renderDayCloseSummary();
    document.getElementById('daily-close-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (automatic && typeof App !== 'undefined') App.showToast('今日记录已整合，可选择填写一日复盘和明日提醒');
  },

  closeDayClose() {
    document.getElementById('daily-close-modal').classList.remove('active');
    this.releaseBodyScroll();
  },

  renderDayCloseSummary() {
    const tasks = this.getTodayTasks();
    const sessions = this.getSessionsForDate(this.todayKey());
    const taskReviews = this.getTodayReviews();
    const sessionReviews = this.getSessionReviewsForDate(this.todayKey());
    const minutes = sessions.reduce((sum, session) => sum + (Number(session.duration) || 0), 0);
    const rows = tasks.map(task => {
      const taskSessions = sessions.filter(session => session.taskId === task.id);
      const taskReview = taskReviews.find(item => item.taskId === task.id);
      const sessionDetails = taskSessions.map((session, index) => {
        const review = sessionReviews.find(item => item.sessionId === session.id);
        const optional = [session.sessionNote || review?.sessionNote, review?.result, review?.nextAction].filter(this.hasText).map(value => `<small>${this.escape(value)}</small>`).join('');
        return `<div class="day-close-session"><span>番茄 ${index + 1} · ${Number(session.duration) || 0} 分钟</span>${optional}</div>`;
      }).join('');
      return `<article><div><strong>${this.escape(task.text)}</strong><span>${taskSessions.length} 个番茄</span></div>${sessionDetails}${taskReview ? `<div class="day-close-task-review">${this.taskReviewContent(taskReview)}</div>` : ''}</article>`;
    }).join('');
    document.getElementById('day-close-review-summary').innerHTML = `<div class="day-close-facts"><span><strong>${tasks.length}</strong>项完成</span><span><strong>${sessions.length}</strong>个番茄</span><span><strong>${taskReviews.length + sessionReviews.length}</strong>条复盘</span><span><strong>${minutes}</strong>分钟专注</span></div><div class="day-close-review-list">${rows || '<p class="review-empty">今天还没有可汇总的任务记录。</p>'}</div>`;
  },

  saveDayClose(closeAfterSave = true, silent = false) {
    const date = this.todayKey();
    const existing = this.getDayClose(date);
    const aiText = document.getElementById('day-close-ai-output').textContent.trim();
    const tomorrowTasks = document.getElementById('day-close-tomorrow-tasks').value.trim();
    const entry = {
      id: existing?.id || this.createId('day-close'),
      date,
      selfReview: document.getElementById('day-close-self-review').value.trim(),
      tomorrowTasks,
      tomorrowDate: this.shiftDateKey(date, 1),
      aiAnalysis: /^尚未分析/.test(aiText) ? '' : aiText,
      focusMinutes: this.getTodayFocusMinutes(),
      completedTaskCount: this.getTodayTasks().length,
      tasksSnapshot: this.getTodayTasks().map(task => ({ ...task })),
      sessionsSnapshot: this.getSessionsForDate(date),
      reviewsSnapshot: this.getTodayReviews(),
      sessionReviewsSnapshot: this.getSessionReviewsForDate(date),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.dailyCloses = this.dailyCloses.filter(item => item.date !== date);
    this.dailyCloses.unshift(entry);
    SafeStore.set('dailyCloseEntries', JSON.stringify(this.dailyCloses));
    if (typeof TaskManager !== 'undefined' && TaskManager.syncReviewReminders) {
      const lines = tomorrowTasks.split(/\r?\n/).map(line => line.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
      TaskManager.syncReviewReminders(date, entry.tomorrowDate, lines);
    }
    this.renderHistory();
    if (!silent && typeof App !== 'undefined') App.showToast(tomorrowTasks ? '今日收尾已保存，明日提醒已加入下一学习日' : '今日收尾已保存');
    if (closeAfterSave) this.closeDayClose();
    return entry;
  },

  fillDeepseekSettings() {
    document.getElementById('deepseek-endpoint').value = this.deepseekSettings.endpoint || 'https://api.deepseek.com/chat/completions';
    document.getElementById('deepseek-model').value = this.deepseekSettings.model || 'deepseek-v4-pro';
    document.getElementById('deepseek-api-key').value = this.deepseekSettings.apiKey || '';
  },

  saveDeepseekSettings(silent = false) {
    this.deepseekSettings = {
      endpoint: document.getElementById('deepseek-endpoint').value.trim() || 'https://api.deepseek.com/chat/completions',
      model: document.getElementById('deepseek-model').value,
      apiKey: document.getElementById('deepseek-api-key').value.trim(),
    };
    SafeStore.set('deepseekSettings', JSON.stringify(this.deepseekSettings));
    if (!silent && typeof App !== 'undefined') App.showToast('API 设置已保存在当前浏览器');
    return this.deepseekSettings;
  },

  buildAnalysisPayload() {
    const tasks = this.getTodayTasks();
    const taskReviews = this.getTodayReviews();
    const sessions = this.getSessionsForDate(this.todayKey());
    const sessionReviews = this.getSessionReviewsForDate(this.todayKey());
    const details = tasks.map((task, index) => {
      const taskReview = taskReviews.find(item => item.taskId === task.id);
      const sessionText = sessions.filter(item => item.taskId === task.id).map((session, sessionIndex) => {
        const review = sessionReviews.find(item => item.sessionId === session.id);
        return `  番茄${sessionIndex + 1}（${session.duration}分钟）：备注=${session.sessionNote || review?.sessionNote || '无'}；完成=${review?.result || '无'}；接续=${review?.nextAction || '无'}`;
      }).join('\n');
      return `${index + 1}. ${task.text}\n${sessionText || '  无番茄记录'}\n任务结果：${taskReview?.result || '无'}\n产出：${taskReview?.output || '无'}\n下一步：${taskReview?.nextAction || '无'}`;
    }).join('\n\n');
    return `日期：${this.todayKey()}\n专注时长：${this.getTodayFocusMinutes()} 分钟\n完成任务：${tasks.length} 项\n\n【任务与番茄记录】\n${details || '无记录'}\n\n【一日复盘】\n${document.getElementById('day-close-self-review').value.trim() || '未填写'}\n\n【明日提醒】\n${document.getElementById('day-close-tomorrow-tasks').value.trim() || '未填写'}`;
  },

  async analyzeWithDeepSeek() {
    const settings = this.saveDeepseekSettings(true);
    const output = document.getElementById('day-close-ai-output');
    const button = document.getElementById('btn-deepseek-analyze');
    if (!settings.apiKey) {
      output.textContent = '请先展开“API 接入设置”，填写 DeepSeek API Key。';
      document.querySelector('.api-settings').open = true;
      return;
    }
    button.disabled = true;
    button.textContent = '正在审查…';
    output.textContent = '正在逐条核对任务、番茄记录、备注和行动漏洞…';
    try {
      const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          messages: [
            { role: 'system', content: '你是严格、直率、基于证据的考研监督教练。禁止空泛鼓励，不羞辱用户。必须引用任务、番茄和备注中的具体事实，指出含糊表述与计划漏洞，并改写为可量化、可验收、有时间边界的行动。证据不足时直接说明。输出：1.今日事实；2.最大痛点；3.模糊项；4.明日最多3项行动；5.立即停止做什么。' },
            { role: 'user', content: this.buildAnalysisPayload() },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `接口返回 ${response.status}`);
      const analysis = data.choices?.[0]?.message?.content?.trim();
      if (!analysis) throw new Error('接口未返回分析内容');
      output.textContent = analysis;
      this.saveDayClose(false, true);
    } catch (error) {
      output.textContent = `分析失败：${error.message}。如果是浏览器跨域限制，请改用自己的兼容代理地址。`;
    } finally {
      button.disabled = false;
      button.textContent = '重新严格分析';
    }
  },

  getReviewsForDate(date) {
    const current = this.reviews.filter(review => review.date === date);
    const snapshot = this.getDayClose(date)?.reviewsSnapshot;
    const merged = new Map((Array.isArray(snapshot) ? snapshot : []).map(review => [review.taskId || review.id, review]));
    current.forEach(review => merged.set(review.taskId || review.id, review));
    return [...merged.values()];
  },

  getTasksForDate(date) {
    const snapshot = this.getDayClose(date)?.tasksSnapshot;
    if (Array.isArray(snapshot) && snapshot.length) return snapshot;
    if (typeof TaskManager === 'undefined') return [];
    if (date === this.todayKey()) return TaskManager.getVisibleTasks();
    return TaskManager.tasks.filter(task => task.kind !== 'habit' && task.date === date);
  },

  getFocusMinutesForDate(date) {
    const sessions = this.getSessionsForDate(date);
    if (sessions.length) return sessions.reduce((sum, session) => sum + (Number(session.duration) || 0), 0);
    return Number(this.getDayClose(date)?.focusMinutes) || 0;
  },

  getTodayFocusMinutes() { return this.getFocusMinutesForDate(this.todayKey()); },

  getHistoryDates() {
    const dates = new Set([
      ...this.reviews.map(review => review.date),
      ...this.sessionReviews.map(review => review.date),
      ...this.dailyCloses.map(entry => entry.date),
      ...this.readArray('focusSessions').map(session => session.date),
    ].filter(Boolean));
    return dates;
  },

  getScheduledTasks(date) {
    if (typeof TaskManager === 'undefined') return [];
    return TaskManager.tasks.filter(task => task.kind !== 'habit' && task.date === date);
  },

  shiftCalendarMonth(amount) {
    const date = this.dateFromKey(this.calendarMonth || (this.todayKey().slice(0, 7) + '-01'));
    date.setMonth(date.getMonth() + amount, 1);
    this.selectCalendarMonth(this.calendarKey(date).slice(0, 7) + '-01');
  },

  selectCalendarMonth(monthKey) {
    this.calendarMonth = monthKey.slice(0, 7) + '-01';
    const today = this.todayKey();
    this.currentHistoryDate = today.slice(0, 7) === this.calendarMonth.slice(0, 7)
      ? today
      : this.calendarMonth;
    this.renderHistory();
  },

  selectHistoryDate(date, focusCalendar = false) {
    this.currentHistoryDate = date;
    this.calendarMonth = `${date.slice(0, 7)}-01`;
    this.renderHistory();
    if (focusCalendar) requestAnimationFrame(() => document.querySelector(`.review-calendar-day[data-date="${date}"]`)?.focus());
  },

  handleCalendarKeydown(event) {
    const date = event.currentTarget.dataset.date;
    let next = '';
    if (event.key === 'ArrowLeft') next = this.shiftDateKey(date, -1);
    if (event.key === 'ArrowRight') next = this.shiftDateKey(date, 1);
    if (event.key === 'ArrowUp') next = this.shiftDateKey(date, -7);
    if (event.key === 'ArrowDown') next = this.shiftDateKey(date, 7);
    if (event.key === 'Home') next = this.shiftDateKey(date, -((this.dateFromKey(date).getDay() + 6) % 7));
    if (event.key === 'End') next = this.shiftDateKey(date, 6 - ((this.dateFromKey(date).getDay() + 6) % 7));
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const target = this.dateFromKey(date);
      const originalDay = target.getDate();
      target.setDate(1);
      target.setMonth(target.getMonth() + (event.key === 'PageUp' ? -1 : 1));
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(originalDay, lastDay));
      next = this.calendarKey(target);
    }
    if (!next) return;
    event.preventDefault();
    this.selectHistoryDate(next, true);
  },

  renderHistory() {
    if (!this.calendarMonth) this.calendarMonth = this.todayKey().slice(0, 7) + '-01';
    if (!this.currentHistoryDate) this.currentHistoryDate = this.todayKey();
    this.renderCalendar();
    this.renderHistoryDetail(this.currentHistoryDate);
  },

  renderCalendar() {
    const grid = document.getElementById('review-calendar-grid');
    const month = this.dateFromKey(this.calendarMonth);
    document.getElementById('review-calendar-title').textContent = `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
    const monthInput = document.getElementById('review-calendar-month');
    if (monthInput) monthInput.value = this.calendarMonth.slice(0, 7);
    const firstWeekday = (month.getDay() + 6) % 7;
    const start = new Date(month);
    start.setDate(1 - firstWeekday);
    const historyDates = this.getHistoryDates();
    const today = this.todayKey();
    const monthPrefix = this.calendarMonth.slice(0, 7);
    const reviewDayCount = [...historyDates].filter(date => date.startsWith(monthPrefix)).length;
    const scheduled = typeof TaskManager === 'undefined' ? [] : TaskManager.tasks.filter(task => task.kind !== 'habit' && String(task.date || '').startsWith(monthPrefix));
    const summary = document.getElementById('review-calendar-summary');
    if (summary) summary.textContent = `${reviewDayCount} 天有复盘 · ${scheduled.length} 项待办`;
    grid.setAttribute('aria-label', `${month.getFullYear()} 年 ${month.getMonth() + 1} 月复盘日历，${reviewDayCount} 天有复盘，${scheduled.length} 项待办`);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cellCount = firstWeekday + daysInMonth <= 35 ? 35 : 42;
    const buttons = [];
    for (let index = 0; index < cellCount; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = this.calendarKey(date);
      const outside = date.getMonth() !== month.getMonth();
      const hasReview = historyDates.has(key);
      const hasTodo = key > today && this.getScheduledTasks(key).length > 0;
      const classes = ['review-calendar-day', outside ? 'outside' : '', key === today ? 'today' : '', key === this.currentHistoryDate ? 'selected' : '', key < today ? 'past' : key > today ? 'future' : '', hasReview ? 'has-review' : '', hasTodo ? 'has-todo' : ''].filter(Boolean).join(' ');
      const state = [key === today ? '今天' : '', hasReview ? '有复盘' : '', hasTodo ? '有待办' : '', outside ? '相邻月份' : ''].filter(Boolean).join('，');
      const selected = key === this.currentHistoryDate;
      buttons.push(`<button class="${classes}" type="button" role="gridcell" data-date="${key}" aria-label="${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日${state ? `，${state}` : ''}" aria-selected="${selected}" tabindex="${selected ? '0' : '-1'}"><span>${date.getDate()}</span><b class="review-day-state" aria-hidden="true">${hasReview ? '复' : ''}${hasTodo ? '办' : ''}</b></button>`);
    }
    grid.innerHTML = buttons.join('');
    grid.querySelectorAll('[data-date]').forEach(button => {
      button.addEventListener('click', () => this.selectHistoryDate(button.dataset.date));
      button.addEventListener('keydown', event => this.handleCalendarKeydown(event));
    });
  },

  renderHistoryDetail(date) {
    if (date > this.todayKey()) { this.renderFutureTodoEditor(date); return; }
    const target = document.getElementById('review-history-detail');
    const close = this.getDayClose(date) || {};
    const reviews = this.getReviewsForDate(date);
    const sessionReviews = this.getSessionReviewsForDate(date);
    const sessions = this.getSessionsForDate(date).length ? this.getSessionsForDate(date) : (Array.isArray(close.sessionsSnapshot) ? close.sessionsSnapshot : []);
    const tasks = this.getTasksForDate(date).filter(task => task.completed);
    const hasData = sessions.length || tasks.length || reviews.length || sessionReviews.length || close.selfReview || close.tomorrowTasks || close.aiAnalysis;
    if (!hasData) {
      target.innerHTML = `<header><div><small>学习日</small><h3>${this.escape(date)}</h3></div></header><div class="review-empty">这一天没有留下复盘或专注记录。</div>`;
      return;
    }
    const sessionRows = sessions.map((session, index) => {
      const review = sessionReviews.find(item => item.sessionId === session.id);
      const details = this.sessionReviewContent(review);
      return `<article class="review-history-task" data-session-id="${this.escape(session.id)}"><div><strong>${this.escape(session.sessionName || `番茄 ${index + 1}`)}</strong><span>${Number(session.duration) || 0} 分钟</span></div>${session.sessionNote && !review?.sessionNote ? `<p>${this.escape(session.sessionNote)}</p>` : ''}${details}<div class="session-review-actions"><button class="text-btn history-session-edit" type="button">${review ? '修改单次复盘' : '补写单次复盘'}</button></div></article>`;
    }).join('');
    const taskRows = reviews.map(review => `<article class="review-history-task" data-task-id="${this.escape(review.taskId)}"><div><strong>${this.escape(review.taskTitle || '未命名任务')}</strong>${review.difficulty ? `<span>${this.escape(review.difficulty)}</span>` : ''}</div>${review.result ? `<p>${this.escape(review.result)}</p>` : ''}${review.output ? `<small>产出：${this.escape(review.output)}</small>` : ''}${review.nextAction ? `<small>下一步：${this.escape(review.nextAction)}</small>` : ''}<div class="review-row-actions"><button class="text-btn history-task-edit" type="button">修改任务复盘</button></div></article>`).join('');
    const sections = [
      close.selfReview ? `<section><h4>一日复盘</h4><p>${this.escape(close.selfReview)}</p></section>` : '',
      close.tomorrowTasks ? `<section><h4>次日提醒</h4><p>${this.escape(close.tomorrowTasks)}</p></section>` : '',
      close.aiAnalysis ? `<section><h4>AI 点评</h4><p class="review-history-analysis">${this.escape(close.aiAnalysis)}</p></section>` : '',
      sessionRows ? `<section><h4>番茄钟记录</h4><div class="review-history-tasks">${sessionRows}</div></section>` : '',
      taskRows ? `<section><h4>任务完成复盘</h4><div class="review-history-tasks">${taskRows}</div></section>` : '',
    ].filter(Boolean).join('');
    target.innerHTML = `<header><div><small>学习日</small><h3>${this.escape(date)}${date === this.todayKey() ? ' · 今天' : ''}</h3></div><div class="review-history-facts"><span><strong>${tasks.length || Number(close.completedTaskCount) || 0}</strong>完成</span><span><strong>${sessions.length}</strong>番茄</span><span><strong>${this.getFocusMinutesForDate(date)}</strong>分钟</span></div></header>${sections}`;
    target.querySelectorAll('.history-session-edit').forEach(button => button.addEventListener('click', event => {
      const session = sessions.find(item => item.id === event.currentTarget.closest('[data-session-id]').dataset.sessionId);
      if (session) this.openForSession(session);
    }));
    target.querySelectorAll('.history-task-edit').forEach(button => button.addEventListener('click', event => {
      const taskId = event.currentTarget.closest('[data-task-id]').dataset.taskId;
      const review = reviews.find(item => item.taskId === taskId);
      const task = tasks.find(item => item.id === taskId) || { id: taskId, text: review?.taskTitle || '未命名任务', completed: true };
      this.openForTask({ ...task, completed: true }, date);
    }));
  },

  renderFutureTodoEditor(date) {
    const target = document.getElementById('review-history-detail');
    const tasks = this.getScheduledTasks(date);
    const rows = tasks.map(task => `<li class="calendar-task-item today-task"><span class="calendar-task-marker" aria-hidden="true"></span><span class="task-text">${this.escape(task.text)}<small class="task-taxonomy"><b class="today-badge">今日任务</b></small></span><button class="task-delete calendar-task-delete" type="button" data-task-id="${this.escape(task.id)}" aria-label="删除${this.escape(task.text)}">×</button></li>`).join('');
    target.innerHTML = `<header><div><small>未来安排</small><h3>${this.escape(date)}</h3></div><div class="review-history-facts"><span><strong>${tasks.length}</strong>待办</span></div></header><section class="calendar-todo-editor"><h4>该日自动出现的每日任务</h4><ul>${rows || '<li class="calendar-todo-empty">尚未安排待办。</li>'}</ul><label for="calendar-todo-input">添加待办</label><div><input id="calendar-todo-input" type="text" maxlength="200" placeholder="输入任务，按 Enter 添加"><button id="calendar-todo-add" class="primary-btn compact" type="button">添加到该日</button></div><small>到该学习日早上 8 点刷新后，它会出现在左侧每日任务中。</small></section>`;
    const add = () => {
      const input = document.getElementById('calendar-todo-input');
      const text = input.value.trim();
      if (!text || typeof TaskManager === 'undefined') return;
      TaskManager.addDatedTask(text, date, { sourceFile: '复盘日历' });
      this.renderHistory();
      setTimeout(() => document.getElementById('calendar-todo-input')?.focus(), 0);
    };
    document.getElementById('calendar-todo-add')?.addEventListener('click', add);
    document.getElementById('calendar-todo-input')?.addEventListener('keydown', event => { if (event.key === 'Enter') add(); });
    target.querySelectorAll('.calendar-task-delete').forEach(button => button.addEventListener('click', () => {
      if (typeof TaskManager === 'undefined') return;
      TaskManager.deleteTask(button.dataset.taskId);
      this.renderHistory();
    }));
  },

  modeDifficulty(reviews) {
    const counts = {};
    reviews.forEach(review => { if (review.difficulty) counts[review.difficulty] = (counts[review.difficulty] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  },

  buildMarkdown(entry = this.getDayClose() || {}) {
    const date = entry.date || this.todayKey();
    const tasks = date === this.todayKey() ? this.getTodayTasks() : (entry.tasksSnapshot || []);
    const sessions = date === this.todayKey() ? this.getSessionsForDate(date) : (entry.sessionsSnapshot || []);
    const taskReviews = date === this.todayKey() ? this.getTodayReviews() : (entry.reviewsSnapshot || []);
    const sessionReviews = date === this.todayKey() ? this.getSessionReviewsForDate(date) : (entry.sessionReviewsSnapshot || []);
    const lines = [`# 每日学习复盘 · ${date}`, '', `- 完成任务：${tasks.length} 项`, `- 番茄钟：${sessions.length} 个`, `- 专注时长：${sessions.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)} 分钟`];
    if (sessions.length) {
      lines.push('', '## 番茄钟记录');
      sessions.forEach((session, index) => {
        const review = sessionReviews.find(item => item.sessionId === session.id);
        lines.push('', `### ${index + 1}. ${session.sessionName || '未命名专注'}（${session.duration || 0} 分钟）`);
        if (session.sessionNote || review?.sessionNote) lines.push(`- 备注：${review?.sessionNote || session.sessionNote}`);
        if (review?.result) lines.push(`- 完成：${review.result}`);
        if (review?.difficulty) lines.push(`- 状态：${review.difficulty}`);
        if (review?.nextAction) lines.push(`- 接续：${review.nextAction}`);
      });
    }
    if (taskReviews.length) {
      lines.push('', '## 任务完成复盘');
      taskReviews.forEach(review => {
        lines.push('', `### ${review.taskTitle || '未命名任务'}`);
        if (review.result) lines.push(`- 完成情况：${review.result}`);
        if (review.difficulty) lines.push(`- 状态：${review.difficulty}`);
        if (review.output) lines.push(`- 产出：${review.output}`);
        if (review.nextAction) lines.push(`- 下一步：${review.nextAction}`);
      });
    }
    if (entry.selfReview) lines.push('', '## 一日复盘', '', entry.selfReview);
    if (entry.tomorrowTasks) lines.push('', '## 明日提醒', '', entry.tomorrowTasks);
    if (entry.aiAnalysis) lines.push('', '## DeepSeek 严格点评', '', entry.aiAnalysis);
    return lines.join('\n');
  },

  exportDayClose() {
    const entry = this.saveDayClose(false, true);
    this.download(this.buildMarkdown(entry), 'text/markdown;charset=utf-8', `study-day-close-${entry.date}.md`);
    if (typeof App !== 'undefined') App.showToast('已导出完整每日复盘');
  },

  export(format) {
    const date = this.todayKey();
    const dayClose = this.getDayClose(date) || {};
    let content;
    let mime;
    let extension;
    if (format === 'json') {
      content = JSON.stringify({
        date,
        focusMinutes: this.getTodayFocusMinutes(),
        completedTasks: this.getTodayTasks(),
        sessions: this.getSessionsForDate(date),
        sessionReviews: this.getSessionReviewsForDate(date),
        taskReviews: this.getTodayReviews(),
        dayClose,
        exportedAt: new Date().toISOString(),
      }, null, 2);
      mime = 'application/json'; extension = 'json';
    } else {
      content = this.buildMarkdown(dayClose); mime = 'text/markdown;charset=utf-8'; extension = 'md';
    }
    this.download(content, mime, `study-review-${date}.${extension}`);
    if (typeof App !== 'undefined') App.showToast(`已导出${format === 'json' ? ' JSON' : ' Markdown'}复盘`);
  },

  download(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    URL.revokeObjectURL(url);
  },
};
