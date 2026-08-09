/* ============================================
   app.js - Main Application Controller
   Theme, fullscreen and achievements
   ============================================ */

const App = {
  theme: 'light',
  achievements: [],
  studyDayKey: '',
  dayRefreshTimer: null,

  // Achievement definitions
  achievementDefs: [
    { id: 'first_session', name: '初次专注', desc: '完成第1次番茄钟', icon: '🍅', check: (s) => s.totalSessions >= 1 },
    { id: 'ten_sessions', name: '专注新手', desc: '完成10次番茄钟', icon: '⭐', check: (s) => s.totalSessions >= 10 },
    { id: 'fifty_sessions', name: '专注达人', desc: '完成50次番茄钟', icon: '🌟', check: (s) => s.totalSessions >= 50 },
    { id: 'hundred_sessions', name: '番茄大师', desc: '完成100次番茄钟', icon: '👑', check: (s) => s.totalSessions >= 100 },
    { id: 'one_hour_today', name: '一小时挑战', desc: '单日专注超1小时', icon: '⏱️', check: (s) => s.maxDaily >= 60 },
    { id: 'three_hour_today', name: '深度专注', desc: '单日专注超3小时', icon: '🔥', check: (s) => s.maxDaily >= 180 },
    { id: 'six_hour_today', name: '学霸附体', desc: '单日专注超6小时', icon: '📚', check: (s) => s.maxDaily >= 360 },
    { id: 'streak_3', name: '三日坚持', desc: '连续3天专注', icon: '📅', check: (s) => s.currentStreak >= 3 },
    { id: 'streak_7', name: '一周习惯', desc: '连续7天专注', icon: '🗓️', check: (s) => s.currentStreak >= 7 },
    { id: 'streak_30', name: '月度自律', desc: '连续30天专注', icon: '🏅', check: (s) => s.currentStreak >= 30 },
    { id: 'early_bird', name: '早起鸟儿', desc: '早上8点前完成专注', icon: '🌅', check: (s) => s.earlyBird },
    { id: 'night_owl', name: '夜猫子', desc: '晚上10点后完成专注', icon: '🦉', check: (s) => s.nightOwl },
    { id: 'task_master', name: '任务达人', desc: '完成10个任务', icon: '✅', check: (s) => s.completedTasks >= 10 },
    { id: 'task_centurion', name: '任务收割机', desc: '完成100个任务', icon: '🏆', check: (s) => s.completedTasks >= 100 },
    { id: 'total_10h', name: '积累者', desc: '累计专注10小时', icon: '⏳', check: (s) => s.totalHours >= 10 },
    { id: 'total_100h', name: '修行者', desc: '累计专注100小时', icon: '🧘', check: (s) => s.totalHours >= 100 },
    { id: 'total_500h', name: '苦行僧', desc: '累计专注500小时', icon: '🏔️', check: (s) => s.totalHours >= 500 },
  ],

  init() {
    this.loadState();
    this.bindUI();
    this.applyTheme();

    // Initialize all modules
    Background.init();
    AudioEngine.init();
    PomodoroTimer.init();
    SubjectManager.init();
    CourseManager.init();
    TaskManager.init();
    PlanManager.init();
    ImportHub.init();
    SyncManager.init();
    Stats.init();
    ReviewManager.init();
    if (typeof GoalManager !== 'undefined') GoalManager.init();
    this.startDailyRefresh();

    // Update streak/total display
    this.updateStreakAndTotal();
    this.checkAchievements();
  },

  bindUI() {
    document.getElementById('btn-theme').addEventListener('click', () => this.toggleTheme());
    document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('btn-panorama')?.addEventListener('click', () => this.togglePanorama());
    document.getElementById('btn-refresh-app')?.addEventListener('click', () => this.refreshPage());
    document.getElementById('btn-exit-panorama')?.addEventListener('click', () => this.exitPanorama());
    document.getElementById('btn-achievements').addEventListener('click', () => this.openAchievements());
    document.getElementById('btn-download-templates').addEventListener('click', () => TemplateManager.download('all'));

    // Achievement modal close
    const achModal = document.getElementById('achievements-modal');
    achModal.querySelector('.modal-close').addEventListener('click', () => this.closeAchievements());
    achModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeAchievements());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        PomodoroTimer.toggle();
      }
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        PomodoroTimer.reset();
      }
      if (e.code === 'KeyI' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (typeof SyncManager !== 'undefined') SyncManager.open();
      }
      if (e.code === 'KeyE' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (typeof Stats !== 'undefined') Stats.exportData();
      }
      if (e.code === 'Escape' && document.body.classList.contains('panorama-mode')) {
        this.exitPanorama();
      }
    });
  },

  getStudyDateKey(date = new Date()) {
    const d = new Date(date);
    if (d.getHours() < 7) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  refreshPage() {
    this.showToast('正在刷新页面...');
    setTimeout(() => window.location.reload(), 80);
  },

  startDailyRefresh() {
    this.studyDayKey = this.getStudyDateKey();
    this.refreshDailyState();
    if (this.dayRefreshTimer) clearInterval(this.dayRefreshTimer);
    this.dayRefreshTimer = setInterval(() => {
      const key = this.getStudyDateKey();
      if (key !== this.studyDayKey) {
        this.studyDayKey = key;
        this.refreshDailyState();
        this.showToast('新的一天开始了，固定每日任务已刷新');
      }
    }, 60000);
  },

  refreshDailyState() {
    const planChanged = typeof PlanManager !== 'undefined' && PlanManager.refreshDailyState?.();
    const taskChanged = typeof TaskManager !== 'undefined' && TaskManager.refreshDailyState?.();
    if (planChanged && PlanManager.render) PlanManager.render();
    if (taskChanged && TaskManager.render) TaskManager.render();
    if (typeof PomodoroTimer !== 'undefined') PomodoroTimer.loadTodayData?.();
    if (typeof Stats !== 'undefined') {
      Stats.needsRefresh = true;
      Stats.updateDashboardInsights?.();
    }
    this.updateStreakAndTotal();
  },

  togglePanorama() {
    if (document.body.classList.contains('panorama-mode')) {
      this.exitPanorama();
      return;
    }
    document.body.classList.add('panorama-mode');
    const exit = document.getElementById('panorama-exit');
    if (exit) exit.setAttribute('aria-hidden', 'false');
  },

  exitPanorama() {
    document.body.classList.remove('panorama-mode');
    const exit = document.getElementById('panorama-exit');
    if (exit) exit.setAttribute('aria-hidden', 'true');
  },

  loadState() {
    try {
      const s = JSON.parse(localStorage.getItem('appSettings'));
      if (s) {
        this.theme = s.theme || 'light';
        this.achievements = s.achievements || [];
      }
    } catch(e) {}
  },

  saveState() {
    SafeStore.set('appSettings', JSON.stringify({
      theme: this.theme,
      achievements: this.achievements,
    }));
  },

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', this.theme);
    document.getElementById('btn-theme').textContent = this.theme === 'dark' ? '☀️' : '🌓';

    // Re-render charts if stats modal is open
    if (document.getElementById('stats-modal').classList.contains('active')) {
      setTimeout(() => Stats.refresh(), 300);
    }

    this.saveState();
  },

  applyTheme() {
    document.body.setAttribute('data-theme', this.theme);
    document.getElementById('btn-theme').textContent = this.theme === 'dark' ? '☀️' : '🌓';
  },

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  },

  // ---- Stats helpers ----

  getStats() {
    let sessions = [];
    try {
      const storedSessions = JSON.parse(localStorage.getItem('focusSessions') || '[]');
      sessions = Array.isArray(storedSessions) ? storedSessions : [];
    } catch (e) {}
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((s, r) => s + (Number(r.duration) || 0), 0);
    const totalHours = totalMinutes / 60;

    // Max daily
    const dailyMap = {};
    sessions.forEach(s => {
      if (!s.date) return;
      dailyMap[s.date] = (dailyMap[s.date] || 0) + (Number(s.duration) || 0);
    });
    const maxDaily = Object.values(dailyMap).reduce((max, v) => Math.max(max, v), 0);

    // Current streak
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = this.getStudyDateKey(d);
      if (dailyMap[key]) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }

    // Early bird / night owl
    const timestamps = sessions.map(s => s.timestamp).filter(Boolean);
    const earlyBird = timestamps.some(t => {
      const h = new Date(t).getHours();
      return h < 8;
    });
    const nightOwl = timestamps.some(t => {
      const h = new Date(t).getHours();
      return h >= 22;
    });

    // Completed tasks
    let tasks = [];
    try {
      const storedTasks = JSON.parse(localStorage.getItem('tasks') || '[]');
      tasks = Array.isArray(storedTasks) ? storedTasks : [];
    } catch (e) {}
    const completedTasks = tasks.filter(t => t.completed).length;

    return { totalSessions, totalMinutes, totalHours, maxDaily, currentStreak, earlyBird, nightOwl, completedTasks };
  },

  // ---- Achievements ----

  checkAchievements() {
    const stats = this.getStats();
    let newUnlocks = false;

    this.achievementDefs.forEach(def => {
      if (this.achievements.includes(def.id)) return;
      if (def.check(stats)) {
        this.achievements.push(def.id);
        this.showToast(`🏆 解锁成就: ${def.icon} ${def.name}`);
        newUnlocks = true;
      }
    });

    if (newUnlocks) {
      this.saveState();
      this.updateStreakAndTotal();
    }
  },

  openAchievements() {
    this.renderAchievements();
    document.getElementById('achievements-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeAchievements() {
    document.getElementById('achievements-modal').classList.remove('active');
    document.body.style.overflow = '';
  },

  renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    const stats = this.getStats();

    grid.innerHTML = this.achievementDefs.map(def => {
      const unlocked = this.achievements.includes(def.id);
      const cls = unlocked ? 'unlocked' : 'locked';
      return `
        <div class="achievement-card ${cls}">
          <div class="achievement-icon">${def.icon}</div>
          <div class="achievement-name">${def.name}</div>
          <div class="achievement-desc">${def.desc}</div>
          ${unlocked ? '<div class="achievement-date">已解锁</div>' : ''}
        </div>
      `;
    }).join('');
  },

  // ---- Streak & Total Display ----

  updateStreakAndTotal() {
    const stats = this.getStats();

    document.getElementById('streak-days').textContent = stats.currentStreak + ' 天';
    document.getElementById('total-hours').textContent = stats.totalHours.toFixed(1) + ' 小时';
    if (typeof Stats !== 'undefined') Stats.updateDashboardInsights();
  },

  // ---- Toast ----

  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
