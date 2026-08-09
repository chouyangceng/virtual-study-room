/* ============================================
   reviews.js - Per-task review and daily digest
   ============================================ */

const ReviewManager = {
  reviews: [],
  dailyCloses: [],
  deepseekSettings: {},
  pendingTask: null,

  init() {
    this.load();
    const reviewModal = document.getElementById('task-review-modal');
    const dailyModal = document.getElementById('reviews-modal');
    const closeModal = document.getElementById('daily-close-modal');
    document.getElementById('btn-reviews').addEventListener('click', () => this.openDaily());
    reviewModal.querySelector('.modal-close').addEventListener('click', () => this.closeTaskReview());
    reviewModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeTaskReview());
    dailyModal.querySelector('.modal-close').addEventListener('click', () => this.closeDaily());
    dailyModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeDaily());
    document.getElementById('btn-save-review').addEventListener('click', () => this.savePendingReview());
    document.getElementById('btn-skip-review').addEventListener('click', () => this.closeTaskReview(true));
    document.getElementById('btn-export-review-md').addEventListener('click', () => this.export('markdown'));
    document.getElementById('btn-export-review-json').addEventListener('click', () => this.export('json'));
    document.getElementById('btn-open-day-close').addEventListener('click', () => this.openDayClose(false));
    closeModal.querySelector('.modal-close').addEventListener('click', () => this.closeDayClose());
    closeModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeDayClose());
    document.getElementById('btn-save-day-close').addEventListener('click', () => this.saveDayClose());
    document.getElementById('btn-export-day-close').addEventListener('click', () => this.exportDayClose());
    document.getElementById('btn-save-deepseek-settings').addEventListener('click', () => this.saveDeepseekSettings());
    document.getElementById('btn-deepseek-analyze').addEventListener('click', () => this.analyzeWithDeepSeek());
    this.fillDeepseekSettings();
  },

  load() {
    try {
      const value = JSON.parse(localStorage.getItem('dailyReviews') || '[]');
      this.reviews = Array.isArray(value) ? value : [];
    } catch (e) { this.reviews = []; }
    try {
      const value = JSON.parse(localStorage.getItem('dailyCloseEntries') || '[]');
      this.dailyCloses = Array.isArray(value) ? value : [];
    } catch (e) { this.dailyCloses = []; }
    try { this.deepseekSettings = JSON.parse(localStorage.getItem('deepseekSettings') || '{}') || {}; }
    catch (e) { this.deepseekSettings = {}; }
  },

  save() { SafeStore.set('dailyReviews', JSON.stringify(this.reviews)); },
  todayKey(date = new Date()) {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey(date) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); },

  getReviewForTask(taskId, date = this.todayKey()) {
    return this.reviews.find(review => review.taskId === taskId && review.date === date) || null;
  },

  getPendingTasks() {
    const tasks = this.getTodayTasks();
    const reviewed = new Set(this.getTodayReviews().map(review => review.taskId));
    return tasks.filter(task => !reviewed.has(task.id));
  },

  getSubjectReviewSummary(tasks = this.getTodayTasks(), reviews = this.getTodayReviews()) {
    const reviewed = new Set(reviews.map(review => review.taskId));
    const groups = {};
    tasks.forEach(task => {
      const name = task.subjectName || task.subject || task.category || '未分类';
      if (!groups[name]) groups[name] = { total: 0, reviewed: 0 };
      groups[name].total += 1;
      if (reviewed.has(task.id)) groups[name].reviewed += 1;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, ...value }));
  },

  openForTask(task) {
    if (!task || !task.completed) return;
    const date = this.todayKey();
    const existing = this.getReviewForTask(task.id, date);
    this.pendingTask = { ...task, date, existingReviewId: existing?.id || '' };
    document.getElementById('review-task-name').textContent = task.text;
    document.getElementById('review-result').value = existing?.result || '';
    document.getElementById('review-output').value = existing?.output || '';
    document.getElementById('review-next').value = existing?.nextAction || '';
    document.getElementById('review-difficulty').value = existing?.difficulty || '正常';
    document.getElementById('btn-save-review').textContent = existing ? '更新复盘' : '保存复盘';
    document.getElementById('task-review-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeTaskReview(skipped = false) {
    document.getElementById('task-review-modal').classList.remove('active');
    this.pendingTask = null;
    document.getElementById('btn-save-review').textContent = '保存复盘';
    document.body.style.overflow = '';
    if (skipped && typeof App !== 'undefined') App.showToast('已完成任务，可在每日复盘中补充');
    this.checkDayComplete();
  },

  savePendingReview() {
    if (!this.pendingTask) return;
    const existing = this.getReviewForTask(this.pendingTask.id, this.pendingTask.date);
    const review = {
      id: existing?.id || `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      taskId: this.pendingTask.id,
      planId: this.pendingTask.planId || '',
      date: this.pendingTask.date,
      taskTitle: this.pendingTask.text,
      result: document.getElementById('review-result').value.trim() || '已完成任务',
      difficulty: document.getElementById('review-difficulty').value,
      output: document.getElementById('review-output').value.trim(),
      nextAction: document.getElementById('review-next').value.trim(),
      createdAt: Date.now(),
    };
    this.reviews = this.reviews.filter(item => !(item.taskId === review.taskId && item.date === review.date));
    this.reviews.unshift(review);
    this.save();
    this.closeTaskReview();
    if (typeof App !== 'undefined') App.showToast('📝 复盘已保存');
    this.checkDayComplete();
  },

  deleteReview(reviewId) {
    const review = this.reviews.find(item => item.id === reviewId);
    if (!review) return;
    if (!window.confirm(`删除这条复盘「${review.taskTitle}」？`)) return;
    this.reviews = this.reviews.filter(item => item.id !== reviewId);
    this.save();
    this.renderDaily();
    if (typeof App !== 'undefined') App.showToast('已删除一条复盘');
  },

  getTodayTasks() {
    if (typeof TaskManager === 'undefined') return [];
    return TaskManager.getVisibleTasks().filter(task => task.completed);
  },

  getTodayReviews() { return this.reviews.filter(review => review.date === this.todayKey()); },

  openDaily() {
    this.renderDaily();
    document.getElementById('reviews-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeDaily() {
    document.getElementById('reviews-modal').classList.remove('active');
    document.body.style.overflow = '';
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
    window.setTimeout(() => this.openDayClose(true), 220);
  },

  getDayClose(date = this.todayKey()) { return this.dailyCloses.find(item => item.date === date); },

  openDayClose(automatic = false) {
    this.closeDaily();
    const date = this.todayKey();
    const saved = this.getDayClose(date) || {};
    document.getElementById('day-close-date').textContent = date;
    document.getElementById('day-close-self-review').value = saved.selfReview || '';
    document.getElementById('day-close-tomorrow-tasks').value = saved.tomorrowTasks || '';
    document.getElementById('day-close-ai-output').textContent = saved.aiAnalysis || '尚未分析。填写整日复盘和明日清单后，点击“开始严格分析”。';
    this.renderDayCloseSummary();
    document.getElementById('daily-close-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (automatic && typeof App !== 'undefined') App.showToast('🌙 今日任务已全部完成，请做收尾复盘');
  },

  closeDayClose() {
    document.getElementById('daily-close-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  renderDayCloseSummary() {
    const tasks = this.getTodayTasks();
    const reviews = this.getTodayReviews();
    const pending = tasks.length - reviews.length;
    const minutes = this.getTodayFocusMinutes();
    const rows = tasks.map(task => {
      const review = reviews.find(item => item.taskId === task.id);
      return `<article><div><strong>${this.escape(task.text)}</strong><span>${review ? this.escape(review.difficulty) : '未复盘'}</span></div>${review ? `<p>${this.escape(review.result)}</p>${review.output ? `<small>产出：${this.escape(review.output)}</small>` : ''}${review.nextAction ? `<small>下一步：${this.escape(review.nextAction)}</small>` : ''}` : '<p>已完成，但没有留下小复盘。</p>'}</article>`;
    }).join('');
    document.getElementById('day-close-review-summary').innerHTML = `<div class="day-close-facts"><span><strong>${tasks.length}</strong>项完成</span><span><strong>${reviews.length}</strong>项复盘</span><span><strong>${pending > 0 ? pending : 0}</strong>项待补充</span><span><strong>${minutes}</strong>分钟专注</span></div><div class="day-close-review-list">${rows || '<p class="review-empty">今天还没有完成任务记录。</p>'}</div>`;
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
    if (!silent && typeof App !== 'undefined') App.showToast('🔐 API 设置已保存在当前浏览器');
    return this.deepseekSettings;
  },

  buildAnalysisPayload() {
    const tasks = this.getTodayTasks();
    const reviews = this.getTodayReviews();
    const pending = this.getPendingTasks();
    const reviewText = tasks.map((task, index) => {
      const review = reviews.find(item => item.taskId === task.id);
      return `${index + 1}. ${task.text}\n完成情况：${review?.result || '未填写'}\n难度：${review?.difficulty || '未填写'}\n实际产出：${review?.output || '未填写'}\n下一步：${review?.nextAction || '未填写'}`;
    }).join('\n\n');
    return `日期：${this.todayKey()}\n专注时长：${this.getTodayFocusMinutes()} 分钟\n完成任务：${tasks.length} 项\n待复盘：${pending.length} 项\n\n【逐项复盘】\n${reviewText || '无记录'}\n\n【待复盘任务】\n${pending.map((task, index) => `${index + 1}. ${task.text}`).join('\n') || '无'}\n\n【整日复盘】\n${document.getElementById('day-close-self-review').value.trim() || '未填写'}\n\n【留给明天的任务】\n${document.getElementById('day-close-tomorrow-tasks').value.trim() || '未填写'}`;
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
    output.textContent = '正在逐条核对事实、模糊表述和计划漏洞…';
    try {
      const response = await fetch(settings.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          messages: [
            { role: 'system', content: '你是严格、直率、基于证据的考研监督教练。禁止空泛鼓励，禁止“继续努力”“保持状态”等套话；不要羞辱或人身攻击。必须引用用户记录中的具体事实，指出借口、矛盾、含糊表述和计划漏洞，并把每个模糊目标改写为可量化、可验收、有时间边界的行动。若证据不足，直接写“证据不足”，并说明必须补充什么。输出固定为五部分：1. 今日事实判定；2. 最大痛点；3. 模棱两可清单；4. 明日必须完成（最多3项，含时间和验收标准）；5. 立即停止做什么。语言简洁、尖锐、可执行。' },
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
      output.textContent = `分析失败：${error.message}。如果是浏览器跨域限制，请将接口地址改为你自己的兼容代理地址。`;
    } finally {
      button.disabled = false;
      button.textContent = '重新严格分析';
    }
  },

  saveDayClose(closeAfterSave = true, silent = false) {
    const entry = {
      date: this.todayKey(),
      selfReview: document.getElementById('day-close-self-review').value.trim(),
      tomorrowTasks: document.getElementById('day-close-tomorrow-tasks').value.trim(),
      aiAnalysis: document.getElementById('day-close-ai-output').textContent.trim(),
      focusMinutes: this.getTodayFocusMinutes(),
      completedTaskCount: this.getTodayTasks().length,
      reviewsSnapshot: this.getTodayReviews(),
      updatedAt: new Date().toISOString(),
    };
    this.dailyCloses = this.dailyCloses.filter(item => item.date !== entry.date);
    this.dailyCloses.unshift(entry);
    SafeStore.set('dailyCloseEntries', JSON.stringify(this.dailyCloses));
    if (!silent && typeof App !== 'undefined') App.showToast('🌙 今日收尾已保存');
    if (closeAfterSave) this.closeDayClose();
    return entry;
  },

  exportDayClose() {
    const entry = this.saveDayClose(false, true);
    const content = this.buildMarkdown(entry);
    this.download(content, 'text/markdown;charset=utf-8', `study-day-close-${entry.date}.md`);
    if (typeof App !== 'undefined') App.showToast('📥 已导出完整每日复盘');
  },

  buildMarkdown(entry = this.getDayClose() || {}) {
    const tasks = this.getTodayTasks();
    const reviews = this.getTodayReviews();
    const pending = tasks.filter(task => !reviews.some(review => review.taskId === task.id));
    const subjectSummary = this.getSubjectReviewSummary(tasks, reviews);
    const lines = [`# 每日学习复盘 · ${this.todayKey()}`, '', `- 完成任务：${tasks.length} 项`, `- 已复盘：${reviews.length} 项`, `- 待复盘：${pending.length} 项`, `- 专注时长：${this.getTodayFocusMinutes()} 分钟`, `- 主要难度：${this.modeDifficulty(reviews)}`, '', '## 学科复盘完成率', '', subjectSummary.length ? subjectSummary.map(item => `- ${item.name}：${item.reviewed}/${item.total}`).join('\n') : '无', '', '## 任务复盘'];
    tasks.forEach(task => {
      const review = reviews.find(item => item.taskId === task.id);
      lines.push('', `### ${task.text}`, review ? `- 完成情况：${review.result}` : '- 状态：待复盘');
      if (review?.difficulty) lines.push(`- 难度：${review.difficulty}`);
      if (review?.output) lines.push(`- 实际产出：${review.output}`);
      if (review?.nextAction) lines.push(`- 下一步：${review.nextAction}`);
    });
    lines.push('', '## 未复盘任务', '', pending.length ? pending.map(task => `- ${task.text}`).join('\n') : '无', '', '## 整日复盘', '', entry.selfReview || '未填写', '', '## 留给明天的未完成任务', '', entry.tomorrowTasks || '未填写', '', '## DeepSeek 严格点评', '', entry.aiAnalysis || '未分析');
    return lines.join('\n');
  },

  download(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  },

  renderDaily() {
    const tasks = this.getTodayTasks();
    const reviews = this.getTodayReviews();
    const pending = this.getPendingTasks();
    const minutes = this.getTodayFocusMinutes();
    const difficulty = reviews.length ? this.modeDifficulty(reviews) : '—';
    document.getElementById('review-summary-completed').textContent = tasks.length;
    document.getElementById('review-summary-reviewed').textContent = reviews.length;
    document.getElementById('review-summary-minutes').textContent = minutes;
    document.getElementById('review-summary-difficulty').textContent = difficulty;
    const subjectSummary = this.getSubjectReviewSummary(tasks, reviews).map(item => `${item.name} ${item.reviewed}/${item.total}`).join(' · ');
    document.getElementById('review-summary-text').textContent = tasks.length ? `今天完成 ${tasks.length} 项任务，已完成 ${reviews.length} 项复盘${pending.length ? `，还有 ${pending.length} 项待补充。` : '。'}${subjectSummary ? ` 学科：${subjectSummary}` : ''}` : '今天还没有完成任务，完成后这里会自动生成日报。';
    const list = document.getElementById('review-list');
    if (!tasks.length && !reviews.length) { list.innerHTML = '<div class="review-empty">完成任务后，每项任务都会出现在这里。</div>'; return; }
    const rows = tasks.map(task => {
      const review = reviews.find(item => item.taskId === task.id);
      return `<article class="review-row${review ? '' : ' pending'}" data-task-id="${this.escape(task.id)}" data-review-id="${this.escape(review?.id || '')}"><div class="review-row-title"><strong>${this.escape(task.text)}</strong><span>${review ? '已复盘' : '待复盘'}</span></div>${review ? `<p>${this.escape(review.result)}</p><div class="review-row-meta"><span>难度：${this.escape(review.difficulty)}</span>${review.output ? `<span>产出：${this.escape(review.output)}</span>` : ''}${review.nextAction ? `<span>下一步：${this.escape(review.nextAction)}</span>` : ''}</div><div class="review-row-actions"><button class="text-btn review-edit" type="button">编辑复盘</button><button class="text-btn danger review-delete" type="button">删除复盘</button></div>` : '<small>这项任务已完成，但还没有复盘。</small><button class="review-fill" type="button">补充复盘</button>'}</article>`;
    }).join('');
    list.innerHTML = rows || reviews.map(review => `<article class="review-row"><div class="review-row-title"><strong>${this.escape(review.taskTitle)}</strong><span>已复盘</span></div><p>${this.escape(review.result)}</p></article>`).join('');
    list.querySelectorAll('.review-fill').forEach(button => button.addEventListener('click', event => {
      const task = tasks.find(item => item.id === event.currentTarget.closest('.review-row').dataset.taskId);
      if (task) this.openForTask(task);
    }));
    list.querySelectorAll('.review-edit').forEach(button => button.addEventListener('click', event => {
      const task = tasks.find(item => item.id === event.currentTarget.closest('.review-row').dataset.taskId);
      if (task) this.openForTask(task);
    }));
    list.querySelectorAll('.review-delete').forEach(button => button.addEventListener('click', event => {
      this.deleteReview(event.currentTarget.closest('.review-row').dataset.reviewId);
    }));
  },

  getTodayFocusMinutes() {
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('focusSessions') || '[]'); } catch (e) {}
    return Array.isArray(sessions) ? sessions.filter(session => session.date === this.todayKey()).reduce((sum, session) => sum + (Number(session.duration) || 0), 0) : 0;
  },

  modeDifficulty(reviews) {
    const counts = {};
    reviews.forEach(review => { counts[review.difficulty] = (counts[review.difficulty] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  },

  export(format) {
    const date = this.todayKey();
    const tasks = this.getTodayTasks();
    const reviews = this.getTodayReviews();
    const minutes = this.getTodayFocusMinutes();
    let content;
    let mime;
    let extension;
    const dayClose = this.getDayClose(date) || null;
    if (format === 'json') {
      content = JSON.stringify({ date, focusMinutes: minutes, completedTasks: tasks, pendingTasks: this.getPendingTasks(), reviews, dayClose, exportedAt: new Date().toISOString() }, null, 2);
      mime = 'application/json'; extension = 'json';
    } else {
      content = this.buildMarkdown(dayClose || {}); mime = 'text/markdown;charset=utf-8'; extension = 'md';
    }
    this.download(content, mime, `study-review-${date}.${extension}`);
    if (typeof App !== 'undefined') App.showToast(`📥 已导出${format === 'json' ? ' JSON' : ' Markdown'}复盘`);
  },
};
