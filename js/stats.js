/* ============================================
   stats.js - Statistics & Charts
   Daily/weekly/monthly focus time analysis
   ============================================ */

const Stats = {
  weeklyChart: null,
  monthlyChart: null,
  categoryChart: null,
  needsRefresh: true,
  displaySessions: [],
  displayActivity: {},

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
    document.getElementById('btn-open-heatmap-stats')?.addEventListener('click', () => this.openModal());
    document.querySelectorAll('[data-chart-retry]').forEach(button => button.addEventListener('click', () => {
      const sessions = this.displaySessions.length ? this.displaySessions : this.getSessions();
      if (button.dataset.chartRetry === 'weekly') this.renderWeeklyChart(sessions);
      if (button.dataset.chartRetry === 'monthly') this.renderMonthlyChart(sessions);
    }));
    this.renderDashboardHeatmap(this.getSessions());
  },

  openModal() {
    document.getElementById('stats-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    const source = document.getElementById('stats-data-source');
    if (source) source.textContent = '正在汇总本机与 Windows 归档数据…';
    requestAnimationFrame(() => requestAnimationFrame(() => this.refresh()));
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

  getLocalActivity() {
    try {
      const activity = JSON.parse(localStorage.getItem('focusActivity') || '{}');
      return activity && typeof activity === 'object' && !Array.isArray(activity) ? activity : {};
    } catch (error) { return {}; }
  },

  sessionIdentity(session) {
    if (!session || typeof session !== 'object') return '';
    if (session.id !== undefined && session.id !== null && String(session.id)) return `id:${String(session.id)}`;
    return ['date', 'timestamp', 'startedAt', 'duration', 'type', 'sessionName', 'taskId']
      .map(key => String(session[key] ?? '')).join('\u0000');
  },

  mergeSessions(localSessions, archivedSessions) {
    const merged = new Map();
    localSessions.forEach((session, index) => {
      const identity = this.sessionIdentity(session);
      if (identity) merged.set(identity, { ...session, _localIndex: index, _archiveOnly: false });
    });
    (Array.isArray(archivedSessions) ? archivedSessions : []).forEach(session => {
      const identity = this.sessionIdentity(session);
      if (!identity || merged.has(identity)) return;
      merged.set(identity, { ...session, _archiveOnly: true });
    });
    return [...merged.values()];
  },

  async refresh() {
    this.needsRefresh = false;
    const localSessions = this.getSessions();
    let sessions = this.mergeSessions(localSessions, []);
    let activity = this.getLocalActivity();
    let devices = [];
    try {
      const aggregate = typeof SyncManager !== 'undefined' ? await SyncManager.fetchArchiveAggregate() : null;
      if (aggregate?.appData) {
        sessions = this.mergeSessions(localSessions, aggregate.appData.focusSessions);
        activity = aggregate.appData.focusActivity || activity;
        devices = Array.isArray(aggregate.devices) ? aggregate.devices : [];
      }
    } catch (error) {
      console.warn('读取 Windows 归档统计失败，将显示本机数据', error);
    }
    this.displaySessions = sessions;
    this.displayActivity = activity;
    const source = document.getElementById('stats-data-source');
    if (source) {
      const names = [...new Set(devices.map(device => device.name).filter(Boolean))];
      source.textContent = names.length
        ? `已汇总 ${names.join(' + ')} · ${sessions.length} 条专注记录`
        : `当前显示本机数据 · ${sessions.length} 条专注记录`;
    }
    this.updateSummaryCards(sessions, activity);
    this.renderWeeklyChart(sessions);
    this.renderMonthlyChart(sessions);
    this.renderCategoryChart(sessions);
    this.renderHeatmaps(sessions);
    this.renderHistory(sessions);
  },

  updateSummaryCards(sessions, activitySource = this.displayActivity) {
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
    const activity = this.getActivityTotals(activitySource);
    const completionRate = activity.attempts > 0
      ? Math.min(100, Math.round((sessions.length / activity.attempts) * 100))
      : (sessions.length ? 100 : null);

    document.getElementById('stat-today-minutes').textContent = todayMinutes;
    document.getElementById('stat-weekly-hours').textContent = (weekMinutes / 60).toFixed(1);
    document.getElementById('stat-average-minutes').textContent = averageMinutes.toFixed(1);
    document.getElementById('stat-completion-rate').textContent = completionRate === null ? '—' : `${completionRate}%`;
    this.updateDashboardInsights(sessions);
  },

  getActivityTotals(activity = this.getLocalActivity()) {
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
    if (this.weeklyChart) { this.weeklyChart.destroy(); this.weeklyChart = null; }
    const canvas = document.getElementById('chart-weekly');
    if (!canvas) return;

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
      days.push(Math.round(mins / 60 * 100) / 100);
    }

    const total = Math.round(days.reduce((sum, value) => sum + value, 0) * 100) / 100;
    document.getElementById('chart-weekly-summary').textContent = `本周共 ${total} 小时；${labels.map((label, index) => `${label} ${days[index]} 小时`).join('，')}`;
    canvas.setAttribute('aria-label', `本周每日专注时长。本周共 ${total} 小时。`);
    if (typeof Chart === 'undefined') {
      this.setChartState('weekly', true, '图表组件未加载，可点击重试；文字数据仍可正常查看');
      return;
    }

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布');
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
      this.setChartState('weekly', false);
    } catch (error) {
      console.error('本周图表绘制失败', error);
      this.setChartState('weekly', true, '本周图表绘制失败，可点击重试；文字数据仍可正常查看');
    }
  },

  renderMonthlyChart(sessions) {
    if (this.monthlyChart) { this.monthlyChart.destroy(); this.monthlyChart = null; }
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;

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
      data.push(Math.round(mins / 60 * 100) / 100);
    }

    const total = Math.round(data.reduce((sum, value) => sum + value, 0) * 100) / 100;
    const bestIndex = data.reduce((best, value, index) => value > data[best] ? index : best, 0);
    document.getElementById('chart-monthly-summary').textContent = total
      ? `本月共 ${total} 小时；最高为 ${labels[bestIndex]} ${data[bestIndex]} 小时。`
      : '本月还没有专注记录。完成一次番茄钟后会显示趋势。';
    canvas.setAttribute('aria-label', total ? `本月专注趋势。本月共 ${total} 小时，最高为 ${labels[bestIndex]}。` : '本月暂无专注数据');
    if (typeof Chart === 'undefined') {
      this.setChartState('monthly', true, '图表组件未加载，可点击重试；文字数据仍可正常查看');
      return;
    }

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建画布');
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
      this.setChartState('monthly', false);
    } catch (error) {
      console.error('本月图表绘制失败', error);
      this.setChartState('monthly', true, '本月图表绘制失败，可点击重试；文字数据仍可正常查看');
    }
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

  setChartState(name, failed, message = '') {
    const canvas = document.getElementById(`chart-${name}`);
    const fallback = document.getElementById(`chart-${name}-fallback`);
    canvas?.classList.toggle('hidden', failed);
    fallback?.classList.toggle('hidden', !failed);
    const text = fallback?.querySelector('span');
    if (text && message) text.textContent = message;
  },

  renderDashboardHeatmap(sessions = this.getSessions()) {
    this.renderYearHeatmap(sessions, 'timer-heatmap-grid');
  },

  renderHeatmaps(sessions) {
    this.renderYearHeatmap(sessions, 'heatmap-grid');
    this.renderDashboardHeatmap(sessions);
  },

  heatLevel(minutes) {
    if (minutes >= 180) return 4;
    if (minutes >= 90) return 3;
    if (minutes >= 30) return 2;
    return minutes > 0 ? 1 : 0;
  },

  renderYearHeatmap(sessions, targetId) {
    const container = document.getElementById(targetId);
    if (!container) return;
    const now = new Date();
    const year = now.getFullYear();
    const first = new Date(year, 0, 1, 12);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const last = new Date(year, 11, 31, 12);
    const end = new Date(last);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const weekCount = Math.round((end - start) / 604800000) + 1;
    const lookup = {};
    sessions.forEach(session => {
      const key = String(session?.date || '');
      if (!key.startsWith(`${year}-`)) return;
      lookup[key] = (lookup[key] || 0) + Math.max(0, Number(session.duration) || 0);
    });
    const activeDays = Object.values(lookup).filter(minutes => minutes > 0).length;
    const totalMinutes = Object.values(lookup).reduce((sum, minutes) => sum + minutes, 0);
    container.innerHTML = `<div class="year-heatmap-scroll"><div class="heatmap-months" aria-hidden="true"></div><div class="heatmap-body"><div class="heatmap-weekdays" aria-hidden="true"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span></div><div class="heatmap-year-grid" role="grid"></div></div></div><div class="heatmap-footer"><span>${year} 年 · ${activeDays} 个专注日 · ${(totalMinutes / 60).toFixed(1)} 小时</span><span class="heatmap-legend"><span>少</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>多</span></span></div>`;
    const months = container.querySelector('.heatmap-months');
    const grid = container.querySelector('.heatmap-year-grid');
    months.style.setProperty('--heatmap-weeks', weekCount);
    grid.style.setProperty('--heatmap-weeks', weekCount);
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    monthNames.forEach((name, month) => {
      const monthStart = new Date(year, month, 1, 12);
      const week = Math.floor((monthStart - start) / 604800000) + 1;
      const label = document.createElement('span');
      label.textContent = name;
      label.style.gridColumn = String(week);
      months.appendChild(label);
    });
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = this.getDayKey(cursor);
      const minutes = lookup[key] || 0;
      const cell = document.createElement('span');
      const outsideYear = cursor.getFullYear() !== year;
      cell.className = `heatmap-cell level-${outsideYear ? 0 : this.heatLevel(minutes)}${outsideYear ? ' outside-year' : ''}${key === this.getDayKey(now) ? ' today' : ''}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${key}，专注 ${minutes} 分钟`);
      cell.title = `${key} · ${minutes} 分钟`;
      grid.appendChild(cell);
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
      const origin = session._archiveDeviceName ? ` · ${this.escape(session._archiveDeviceName)}` : '';
      const deleteButton = session._archiveOnly ? '' : `<button class="history-delete" type="button" data-index="${session._localIndex}" title="删除这条记录" aria-label="删除这条记录">×</button>`;
      return `<div class="history-row">
        <div><strong>${this.escape(session.sessionName || session.subjectName || (session.type === 'work' ? '专注' : '休息'))}</strong><span>${this.escape(date)}${session.subjectName ? ` · ${this.escape(session.subjectName)}` : ''}${origin}</span></div>
        <div class="history-duration">${duration} 分钟 ${deleteButton}</div>
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
    let memoData = {};
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
    try { memoData = JSON.parse(localStorage.getItem('memoData') || '{}'); } catch (e) {}
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
      memoData,
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
