/* ============================================
   stats.js - Statistics & Charts
   Daily/weekly/monthly focus time analysis
   ============================================ */

const Stats = {
  weeklyChart: null,
  monthlyChart: null,
  needsRefresh: true,

  getTextColor() {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue('--text-muted').trim() || '#8a8aaa';
  },

  init() {
    document.getElementById('btn-stats').addEventListener('click', () => this.openModal());
    document.getElementById('stats-modal').querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('stats-modal').querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal());
    document.getElementById('btn-export-data').addEventListener('click', () => this.exportData());
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
    try { return JSON.parse(localStorage.getItem('focusSessions') || '[]'); } catch(e) { return []; }
  },

  refresh() {
    this.needsRefresh = false;
    const sessions = this.getSessions();
    this.updateSummaryCards(sessions);
    this.renderWeeklyChart(sessions);
    this.renderMonthlyChart(sessions);
    this.renderHeatmap(sessions);
  },

  updateSummaryCards(sessions) {
    const today = this.getDateString();
    const weekStart = this.getWeekStart();
    const monthKey = today.substring(0, 7);

    const todayMinutes = sessions
      .filter(s => s.date === today)
      .reduce((sum, s) => sum + s.duration, 0);

    const weekMinutes = sessions
      .filter(s => s.date >= weekStart && s.date <= today)
      .reduce((sum, s) => sum + s.duration, 0);

    const monthMinutes = sessions
      .filter(s => s.date.startsWith(monthKey))
      .reduce((sum, s) => sum + s.duration, 0);

    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);

    document.getElementById('stat-today-minutes').textContent = todayMinutes;
    document.getElementById('stat-weekly-hours').textContent = (weekMinutes / 60).toFixed(1);
    document.getElementById('stat-monthly-hours').textContent = (monthMinutes / 60).toFixed(1);
    document.getElementById('stat-total-hours-all').textContent = (totalMinutes / 60).toFixed(1);
  },

  renderWeeklyChart(sessions) {
    if (this.weeklyChart) this.weeklyChart.destroy();

    const days = [];
    const labels = [];
    const weekStart = new Date(this.getWeekStart() + 'T00:00:00');

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      labels.push(`周${weekdays[d.getDay()]}`);
      const mins = sessions.filter(s => s.date === key).reduce((sum, s) => sum + s.duration, 0);
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
            return i === today ? 'rgba(232, 131, 94, 0.8)' : 'rgba(232, 131, 94, 0.3)';
          }),
          borderColor: 'rgba(232, 131, 94, 1)',
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

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const labels = [];
    const data = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      labels.push(d + '日');
      const mins = sessions.filter(s => s.date === key).reduce((sum, s) => sum + s.duration, 0);
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
      if (s.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)) {
        lookup[s.date] = (lookup[s.date] || 0) + s.duration;
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

  exportData() {
    const data = {
      focusSessions: this.getSessions(),
      tasks: JSON.parse(localStorage.getItem('tasks') || '[]'),
      settings: JSON.parse(localStorage.getItem('timerSettings') || '{}'),
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
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  getWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
};
