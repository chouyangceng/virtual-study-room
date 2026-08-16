/* ============================================
   stats.js - Statistics & Charts
   Daily/weekly/monthly focus time analysis
   ============================================ */

const Stats = {
  weeklyChart: null,
  monthlyChart: null,
  categoryChart: null,
  needsRefresh: true,

  getTextColor() {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue('--text-muted').trim() || '#8a8aaa';
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },

  init() {
    document.getElementById('btn-stats').addEventListener('click', () => this.openModal());
    document.getElementById('stats-modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('stats-modal').querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
    document.getElementById('btn-export-data').addEventListener('click', () => this.exportData());
    document.getElementById('btn-clear-history').addEventListener('click', () => this.clearHistory());
  },

  openModal() {
    this.refresh();
    document.getElementById('stats-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    document.getElementById('stats-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  getSessions() {
    try {
      const sessions = JSON.parse(localStorage.getItem('focusSessions') || '[]');
      return Array.isArray(sessions) ? sessions.filter(s => s && typeof s === 'object') : [];
    } catch(e) { return []; }
  },

  refresh() {
    this.needsRefresh = false;
    const sessions = this.getSessions();
    this.updateSummaryCards(sessions);
    this.renderWeeklyChart(sessions);
    this.renderMonthlyChart(sessions);
    this.renderCategoryChart(sessions);
    this.renderHeatmap(sessions);
    this.renderHistory(sessions);
  },

  updateSummaryCards(sessions) {
    const today = this.getDateString();
    const weekStart = this.getWeekStart();
    const todayMinutes = sessions
      .filter(s => s.date === today)
      .reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

    const weekMinutes = sessions
      .filter(s => s.date >= weekStart && s.date <= today)
      .reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

    const totalMinutes = sessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    const averageMinutes = sessions.length ? totalMinutes / sessions.length : 0;
    const activity = this.getActivityTotals();
    const completionRate = activity.attempts > 0
      ? Math.min(100, Math.round((sessions.length / activity.attempts) * 100))
      : (sessions.length ? 100 : null);

    document.getElementById('stat-today-minutes').textContent = todayMinutes;
    document.getElementById('stat-weekly-hours').textContent = (weekMinutes / 60).toFixed(1);
    document.getElementById('stat-average-minutes').textContent = averageMinutes.toFixed(1);
    document.getElementById('stat-completion-rate').textContent = completionRate === null ? '—' : `${completionRate}%`;
    this.updateDashboardInsights(sessions);
  },

  getActivityTotals() {
    let activity = {};
    try { activity = JSON.parse(localStorage.getItem('focusActivity') || '{}'); } catch (e) {}
    return Object.values(activity || {}).reduce((total, day) => ({
      attempts: total.attempts + (Number(day.attempts) || 0),
      interruptions: total.interruptions + (Number(day.interruptions) || 0),
    }), { attempts: 0, interruptions: 0 });
  },

  getDayKey(date) {
    if (typeof App !== 'undefined' && App.getStudyDateKey) return App.getStudyDateKey(date);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  updateDashboardInsights(sessions = this.getSessions()) {
    const today = this.getDateString();
    const todaySessions = sessions.filter(s => s.date === today);
    const todayMinutes = todaySessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    const average = todaySessions.length ? todayMinutes / todaySessions.length : 0;
    const dashboardSessions = document.getElementById('dashboard-today-sessions');
    const dashboardAverage = document.getElementById('dashboard-average');
    if (dashboardSessions) dashboardSessions.textContent = `${todaySessions.length} 次`;
    if (dashboardAverage) dashboardAverage.textContent = `${average.toFixed(1)} 分钟`;

    const byDay = {};
    sessions.forEach(session => {
      if (!session.date) return;
      byDay[session.date] = (byDay[session.date] || 0) + (Number(session.duration) || 0);
    });

    const longest = sessions.reduce((max, s) => Math.max(max, Number(s.duration) || 0), 0);
    const periods = { '清晨 6–11 点': 0, '下午 12–17 点': 0, '晚上 18–23 点': 0, '深夜 0–5 点': 0 };
    sessions.forEach(session => {
      if (!session.timestamp) return;
      const hour = new Date(session.timestamp).getHours();
      const label = hour < 6 ? '深夜 0–5 点' : hour < 12 ? '清晨 6–11 点' : hour < 18 ? '下午 12–17 点' : '晚上 18–23 点';
      periods[label] += Number(session.duration) || 0;
    });
    const bestPeriod = Object.entries(periods).sort((a, b) => b[1] - a[1])[0];

    const now = new Date();
    const currentSeven = [];
    const previousSeven = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(now);
      current.setDate(now.getDate() - i);
      const previous = new Date(now);
      previous.setDate(now.getDate() - i - 7);
      currentSeven.push(byDay[this.getDayKey(current)] || 0);
      previousSeven.push(byDay[this.getDayKey(previous)] || 0);
    }
    const currentTotal = currentSeven.reduce((sum, value) => sum + value, 0);
    const previousTotal = previousSeven.reduce((sum, value) => sum + value, 0);
    const trend = previousTotal === 0 ? (currentTotal ? '较上周增长' : '暂无数据') : `${currentTotal >= previousTotal ? '+' : ''}${Math.round((currentTotal - previousTotal) / previousTotal * 100)}%`;
    const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

    const setInsight = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setInsight('insight-longest', `${longest || 0} 分钟`);
    setInsight('insight-best-period', bestPeriod && bestPeriod[1] ? bestPeriod[0] : '暂无数据');
    setInsight('insight-seven-day-trend', trend);
    setInsight('insight-best-day', bestDay ? `${bestDay[0].slice(5)} · ${bestDay[1]} 分钟` : '暂无数据');
  },

  renderWeeklyChart(sessions) {
    if (this.weeklyChart) this.weeklyChart.destroy();
    if (typeof Chart === 'undefined') {
      document.getElementById('chart-weekly').replaceWith(this.createChartFallback('chart-weekly', '图表库加载失败，仍可查看下方记录'));
      return;
    }

    const days = [];
    const labels = [];
    const weekStart = new Date(this.getWeekStart() + 'T00:00:00');

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      labels.push(`周${weekdays[d.getDay()]}`);
      const mins = sessions.filter(s => s.date === key).reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
      days.push(Math.round(mins / 60 * 10) / 10); // hours with 1 decimal
    }

    const ctx = document.getElementById('chart-weekly').getContext('2d');
    this.weeklyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '专注时长 (小时)',
          data: days,
          backgroundColor: days.map((v, i) => {
            const today = new Date().getDay();
            return i === today ? 'rgba(201, 160, 135, 0.8)' : 'rgba(201, 160, 135, 0.3)';
          }),
          borderColor: 'rgba(201, 160, 135, 1)',
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => v + 'h',
              color: this.getTextColor(),
              font: { size: 10 },
            },
            grid: { color: 'rgba(128,128,128,0.1)' },
          },
          x: {
            ticks: {
              color: this.getTextColor(),
              font: { size: 10 },
            },
            grid: { display: false },
          },
        },
      },
    });
  },

  renderMonthlyChart(sessions) {
    if (this.monthlyChart) this.monthlyChart.destroy();
    if (typeof Chart === 'undefined') {
      document.getElementById('chart-monthly').replaceWith(this.createChartFallback('chart-monthly', '图表库加载失败，仍可查看下方记录'));
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const labels = [];
    const data = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      labels.push(d + '日');
      const mins = sessions.filter(s => s.date === key).reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
      data.push(Math.round(mins / 60 * 10) / 10);
    }

    const ctx = document.getElementById('chart-monthly').getContext('2d');
    this.monthlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '专注时长 (小时)',
          data,
          borderColor: 'rgba(94, 163, 232, 0.9)',
          backgroundColor: 'rgba(94, 163, 232, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: 'rgba(94, 163, 232, 1)',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => v + 'h',
              color: this.getTextColor(),
              font: { size: 10 },
            },
            grid: { color: 'rgba(128,128,128,0.1)' },
          },
          x: {
            ticks: {
              color: this.getTextColor(),
              font: { size: 9 },
              maxTicksLimit: 15,
            },
            grid: { display: false },
          },
        },
      },
    });
  },

  renderCategoryChart(sessions) {
    if (this.categoryChart) this.categoryChart.destroy();
    const canvas = document.getElementById('chart-categories');
    const empty = document.getElementById('chart-categories-empty');
    if (!canvas || typeof Chart === 'undefined') return;
    const totals = {};
    sessions.forEach(session => {
      const label = session.categoryPath || (session.subjectName && session.subjectName !== '未分类' ? session.subjectName : '未分类');
      totals[label] = (totals[label] || 0) + (Number(session.duration) || 0);
    });
    const entries = Object.entries(totals).filter(([, minutes]) => minutes > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      canvas.classList.add('hidden');
      empty?.classList.remove('hidden');
      return;
    }
    canvas.classList.remove('hidden');
    empty?.classList.add('hidden');
    const colors = ['#2f66d0', '#2d9a7a', '#e29a45', '#8b6ed8', '#d45d6b', '#5b9bb5', '#7f8c99'];
    this.categoryChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: entries.map(([label]) => label),
        datasets: [{
          data: entries.map(([, minutes]) => minutes),
          backgroundColor: entries.map((_, index) => colors[index % colors.length]),
          borderColor: getComputedStyle(document.body).getPropertyValue('--panel-bg').trim() || '#fff',
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { color: this.getTextColor(), boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: context => ` ${context.label}: ${context.raw} 分钟` } },
        },
      },
    });
  },

  createChartFallback(id, text) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'chart-fallback';
    el.textContent = text;
    return el;
  },

  renderHeatmap(sessions) {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const weekHeaders = ['日', '一', '二', '三', '四', '五', '六'];
    weekHeaders.forEach(d => {
      const el = document.createElement('div');
      el.className = 'heatmap-day-header';
      el.textContent = d;
      grid.appendChild(el);
    });

    // Empty cells before first day
    for (let i = 0; i < firstDayOfWeek; i++) {
      const el = document.createElement('div');
      grid.appendChild(el);
    }

    // Build a lookup of minutes per day
    const lookup = {};
    sessions.forEach(s => {
      if (String(s.date || '').startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
        lookup[s.date] = (lookup[s.date] || 0) + (Number(s.duration) || 0);
      }
    });

    const today = new Date().getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const mins = lookup[key] || 0;
      let level = 0;
      if (mins > 0) level = 1;
      if (mins >= 30) level = 2;
      if (mins >= 90) level = 3;
      if (mins >= 180) level = 4;

      const el = document.createElement('div');
      el.className = `heatmap-cell level-${level}`;
      el.title = `${key}: ${mins} 分钟`;
      if (d === today) el.style.border = '2px solid var(--accent)';
      grid.appendChild(el);
    }

    // Fill remaining cells
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainder = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainder; i++) {
      const el = document.createElement('div');
      grid.appendChild(el);
    }
  },

  renderHistory(sessions) {
    const list = document.getElementById('session-history');
    if (!list) return;

    const recent = sessions
      .map((session, index) => ({ ...session, _index: index }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 30);

    if (recent.length === 0) {
      list.innerHTML = '<p class="history-empty">完成一次专注后，记录会显示在这里</p>';
      return;
    }

    list.innerHTML = recent.map(session => {
      const date = session.timestamp
        ? new Date(session.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : `${session.date || '未知日期'}`;
      const duration = Number(session.duration) || 0;
      return `<div class="history-row">
        <div><strong>${this.escape(session.sessionName || session.subjectName || (session.type === 'work' ? '专注' : '休息'))}</strong><span>${this.escape(date)}${session.subjectName ? ` · ${this.escape(session.subjectName)}` : ''}</span></div>
        <div class="history-duration">${duration} 分钟 <button class="history-delete" type="button" data-index="${session._index}" title="删除这条记录" aria-label="删除这条记录">×</button></div>
      </div>`;
    }).join('');

    list.querySelectorAll('.history-delete').forEach(button => {
      button.addEventListener('click', () => this.deleteSession(Number(button.dataset.index)));
    });
  },

  deleteSession(index) {
    const sessions = this.getSessions();
    if (index < 0 || index >= sessions.length) return;
    const session = sessions[index];
    if (!window.confirm(`删除「${session.sessionName || '这条专注'}」的 ${Number(session.duration) || 0} 分钟记录？关联的单次复盘也会删除。`)) return;
    if (!session.id) {
      session.id = `legacy-session-${Date.now().toString(36)}-${index}`;
      SafeStore.set('focusSessions', JSON.stringify(sessions));
    }
    this.removeSessionData([session.id], false);
  },

  clearHistory() {
    const sessions = this.getSessions();
    const hasRelatedData = sessions.length
      || (() => { try { return JSON.parse(SafeStore.get('sessionReviews', '[]')).length > 0; } catch (error) { return false; } })()
      || (() => { try { return JSON.parse(SafeStore.get('dailyCloseEntries', '[]')).some(entry => entry?.sessionsSnapshot?.length || entry?.sessionReviewsSnapshot?.length); } catch (error) { return false; } })();
    if (!hasRelatedData) return;
    if (!window.confirm('确定清空全部专注记录吗？关联的单次复盘、日终番茄快照和任务番茄计数也会同步清理，此操作不可撤销。')) return;
    this.removeSessionData([], true);
  },

  removeSessionData(sessionIds, clearAll) {
    if (typeof VsrArchiveCore === 'undefined' || !VsrArchiveCore.removeSessionRecords) return;
    const read = (key, fallback) => {
      try { return JSON.parse(SafeStore.get(key, JSON.stringify(fallback))); } catch (error) { return fallback; }
    };
    const result = VsrArchiveCore.removeSessionRecords({
      focusSessions: this.getSessions(),
      sessionReviews: read('sessionReviews', []),
      dailyCloseEntries: read('dailyCloseEntries', []),
      dailyData: read('dailyData', null),
      focusActivity: read('focusActivity', {}),
      tasks: read('tasks', []),
    }, sessionIds, { clearAll });
    ['focusSessions', 'sessionReviews', 'dailyCloseEntries', 'dailyData', 'focusActivity', 'tasks'].forEach(key => {
      if (result.appData[key] === undefined || result.appData[key] === null) SafeStore.remove(key);
      else SafeStore.set(key, JSON.stringify(result.appData[key]));
    });
    if (typeof ReviewManager !== 'undefined') {
      ReviewManager.sessionReviews = result.appData.sessionReviews || [];
      ReviewManager.dailyCloses = result.appData.dailyCloseEntries || [];
      ReviewManager.refreshOpenReviewCenter?.();
    }
    if (typeof TaskManager !== 'undefined') {
      TaskManager.tasks = (result.appData.tasks || []).map(task => TaskManager.normalizeTask(task));
      TaskManager.render();
    }
    this.refresh();
    if (typeof PomodoroTimer !== 'undefined') PomodoroTimer.loadTodayData();
    if (typeof App !== 'undefined') {
      App.updateStreakAndTotal();
      App.checkAchievements();
      App.showToast(clearAll ? '专注记录及关联复盘已清空' : '专注记录及关联复盘已删除');
    }
  },

  exportData() {
    let tasks = [];
    let settings = {};
    let focusActivity = {};
    let studyPlans = [];
    let courses = [];
    let studyGoals = [];
    let dailyReviews = [];
    let sessionReviews = [];
    let dailyCloseEntries = [];
    let weeklyReports = [];
    let appSettings = {};
    let deepseekSettings = {};
    try { tasks = JSON.parse(localStorage.getItem('tasks') || '[]'); } catch (e) {}
    try { settings = JSON.parse(localStorage.getItem('timerSettings') || '{}'); } catch (e) {}
    try { focusActivity = JSON.parse(localStorage.getItem('focusActivity') || '{}'); } catch (e) {}
    try { studyPlans = JSON.parse(localStorage.getItem('studyPlans') || '[]'); } catch (e) {}
    try { courses = JSON.parse(localStorage.getItem('courses') || '[]'); } catch (e) {}
    try { studyGoals = JSON.parse(localStorage.getItem('studyGoals') || '[]'); } catch (e) {}
    try { dailyReviews = JSON.parse(localStorage.getItem('dailyReviews') || '[]'); } catch (e) {}
    try { sessionReviews = JSON.parse(localStorage.getItem('sessionReviews') || '[]'); } catch (e) {}
    try { dailyCloseEntries = JSON.parse(localStorage.getItem('dailyCloseEntries') || '[]'); } catch (e) {}
    try { weeklyReports = JSON.parse(localStorage.getItem('weeklyReports') || '[]'); } catch (e) {}
    try { appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}'); } catch (e) {}
    try { deepseekSettings = JSON.parse(localStorage.getItem('deepseekSettings') || '{}'); } catch (e) {}
    const deepseekExport = typeof VsrArchiveCore !== 'undefined'
      ? VsrArchiveCore.sanitizeAppData({ deepseekSettings }).deepseekSettings
      : Object.fromEntries(Object.entries(deepseekSettings || {}).filter(([key]) => !/(?:api[-_]?key|token|authorization|password|secret|credential)/i.test(key)));
    const dayClosePromptedDate = localStorage.getItem('dayClosePromptedDate') || '';
    const data = {
      schemaVersion: typeof VsrArchiveCore !== 'undefined' ? VsrArchiveCore.SNAPSHOT_SCHEMA_VERSION : 3,
      focusSessions: this.getSessions(),
      focusActivity,
      studyPlans,
      tasks,
      timerSettings: settings,
      courses,
      studyGoals,
      dailyReviews,
      sessionReviews,
      dailyCloseEntries,
      weeklyReports,
      appSettings,
      deepseekSettings: deepseekExport,
      currentStudyGoal: localStorage.getItem('currentStudyGoal') || '',
      dayClosePromptedDate,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-data-${this.getDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (typeof App !== 'undefined') App.showToast('📥 数据已导出');
  },

  getDateString() {
    if (typeof App !== 'undefined' && App.getStudyDateKey) return App.getStudyDateKey();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  getWeekStart() {
    const d = new Date(`${this.getDateString()}T12:00:00`);
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
};
