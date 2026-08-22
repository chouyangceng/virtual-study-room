/* ============================================
   app.js - Main Application Controller
   Theme, fullscreen and achievements
   ============================================ */

const App = {
  theme: 'light',
  achievements: [],
  achievementFilter: 'all',
  studyDayKey: '',
  dayRefreshTimer: null,
  modalFocus: new WeakMap(),

  achievementDefs: typeof AchievementCatalog !== 'undefined' ? AchievementCatalog : [],

  init() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    this.loadState();
    this.bindUI();
    this.initModalAccessibility();
    this.applyTheme();

    // Initialize all modules
    Background.init();
    TaskManager.init();
    PomodoroTimer.init();
    CourseManager.init();
    PlanManager.init();
    ImportHub.init();
    SyncManager.init();
    Stats.init();
    ReviewManager.init();
    if (typeof MemoManager !== 'undefined') MemoManager.init();
    if (typeof GoalManager !== 'undefined') GoalManager.init();
    this.startDailyRefresh();

    // Update streak/total display
    this.updateStreakAndTotal();
    this.checkAchievements();
    this.remindBackup();
  },

  remindBackup() {
    try {
      const key = 'lastBackupReminder';
      const last = Number(localStorage.getItem(key) || 0);
      if (Date.now() - last > 30 * 24 * 60 * 60 * 1000) {
        localStorage.setItem(key, String(Date.now()));
        setTimeout(() => {
          if (typeof Stats !== 'undefined') Stats.exportData();
          this.showToast('📤 建议定期导出备份：数据仅存本机，清理浏览器数据会丢失');
        }, 4000);
      }
    } catch (e) { /* ignore */ }
  },

  bindUI() {
    const moreButton = document.getElementById('btn-more');
    const moreMenu = document.getElementById('topbar-menu');
    const closeMoreMenu = () => {
      moreMenu?.classList.add('hidden');
      moreButton?.setAttribute('aria-expanded', 'false');
    };
    moreButton?.addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = moreMenu?.classList.contains('hidden');
      moreMenu?.classList.toggle('hidden', !willOpen);
      moreButton.setAttribute('aria-expanded', String(Boolean(willOpen)));
    });
    moreMenu?.addEventListener('click', event => {
      if (event.target.closest('button')) closeMoreMenu();
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.topbar-more')) closeMoreMenu();
    });
    document.getElementById('btn-theme').addEventListener('click', () => this.toggleTheme());
    document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('btn-panorama')?.addEventListener('click', () => this.togglePanorama());
    document.getElementById('btn-refresh-app')?.addEventListener('click', () => this.resumeTimer());
    document.getElementById('btn-exit-panorama')?.addEventListener('click', () => this.exitPanorama());
    document.getElementById('btn-achievements').addEventListener('click', () => this.openAchievements());
    document.getElementById('btn-download-templates').addEventListener('click', () => TemplateManager.download('all'));

    // Achievement modal close
    const achModal = document.getElementById('achievements-modal');
    achModal.querySelector('.modal-close').addEventListener('click', () => this.closeAchievements());
    achModal.querySelector('.modal-backdrop').addEventListener('click', () => this.closeAchievements());
    achModal.querySelectorAll('[data-achievement-filter]').forEach(button => button.addEventListener('click', () => {
      this.achievementFilter = button.dataset.achievementFilter;
      this.renderAchievements();
    }));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const activeModals = [...document.querySelectorAll('.modal.active')];
      const activeModal = activeModals[activeModals.length - 1];
      if ((e.key === 'Escape' || e.code === 'Escape') && activeModal) {
        e.preventDefault();
        activeModal.querySelector('.modal-close')?.click();
        return;
      }
      if ((e.key === 'Tab' || e.code === 'Tab') && activeModal) {
        const focusable = [...activeModal.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter(element => element.getClientRects().length > 0);
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
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
      if (e.code === 'Escape') closeMoreMenu();
    });
  },

  initModalAccessibility() {
    const observer = new MutationObserver(records => records.forEach(record => {
      const modal = record.target;
      if (modal.classList.contains('active')) {
        this.modalFocus.set(modal, document.activeElement);
        requestAnimationFrame(() => {
          if (modal.classList.contains('active') && !modal.contains(document.activeElement)) {
            modal.querySelector('.modal-close, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
          }
        });
      } else {
        const previous = this.modalFocus.get(modal);
        this.modalFocus.delete(modal);
        if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
      }
    }));
    document.querySelectorAll('.modal').forEach(modal => observer.observe(modal, { attributes: true, attributeFilter: ['class'] }));
  },

  getStudyDateKey(date = new Date()) {
    const d = new Date(date);
    if (d.getHours() < 8) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  resumeTimer() {
    if (typeof PomodoroTimer === 'undefined') return;
    if (PomodoroTimer.isRunning) {
      this.showToast('计时正在进行中');
      return;
    }
    PomodoroTimer.start();
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
        this.showToast('早上 8 点已刷新，每日坚持可以重新打卡了');
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
      Stats.renderDashboardHeatmap?.();
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
    this.updateThemeButton();

    // Re-render charts if stats modal is open
    if (document.getElementById('stats-modal').classList.contains('active')) {
      setTimeout(() => Stats.refresh(), 300);
    }

    this.saveState();
  },

  applyTheme() {
    document.body.setAttribute('data-theme', this.theme);
    this.updateThemeButton();
  },

  updateThemeButton() {
    const button = document.getElementById('btn-theme');
    if (!button) return;
    const label = this.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
    button.title = label;
    button.setAttribute('aria-label', label);
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
    for (let i = 0; i < 5000; i++) {
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
    const habitCompletions = tasks.reduce((sum, task) => sum + (Array.isArray(task.completedDates) ? task.completedDates.length : 0), 0);
    const timedSessionDates = sessions.map(session => {
      const raw = session.timestamp || session.startedAt;
      if (!raw) return null;
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? null : date;
    }).filter(Boolean);
    const sessionHours = timedSessionDates.map(date => date.getHours());
    const earlyBirdCount = sessionHours.filter(hour => hour < 8).length;
    const nightOwlCount = sessionHours.filter(hour => hour >= 22).length;
    const morningSessions = sessionHours.filter(hour => hour >= 8 && hour < 12).length;
    const afternoonSessions = sessionHours.filter(hour => hour >= 12 && hour < 18).length;
    const eveningSessions = sessionHours.filter(hour => hour >= 18 && hour < 22).length;
    const midnightSession = sessionHours.some(hour => hour >= 0 && hour < 5);
    const lunchSession = sessionHours.some(hour => hour >= 11 && hour < 14);
    const weekendSessions = sessions.filter(session => {
      const date = new Date(session.timestamp || session.startedAt || `${session.date || ''}T12:00:00`);
      return date.getDay() === 0 || date.getDay() === 6;
    }).length;
    const perfectTwentyFive = sessions.some(session => Number(session.duration) === 25 && !session.endedEarly);
    const perfectTwentyFiveCount = sessions.filter(session => Number(session.duration) === 25 && !session.endedEarly).length;
    const longestSession = sessions.reduce((max, session) => Math.max(max, Number(session.duration) || 0), 0);
    const focusDays = Object.keys(dailyMap).length;
    const categoryCount = new Set(sessions.map(session => String(session.categoryPath || '').trim()).filter(Boolean)).size;
    const endedEarlyCount = sessions.filter(session => session.endedEarly).length;
    const shortSessions = sessions.filter(session => {
      const duration = Number(session.duration) || 0;
      return duration > 0 && duration <= 15;
    }).length;
    const longSessions = sessions.filter(session => (Number(session.duration) || 0) >= 45).length;
    const notedSessions = sessions.filter(session => String(session.sessionNote || '').trim()).length;
    const taskLinkedSessions = sessions.filter(session => String(session.taskId || '').trim()).length;
    const productiveDays = Object.values(dailyMap).filter(minutes => minutes >= 60).length;
    const activeWeeks = new Set(sessions.map(session => {
      const date = session.date ? new Date(`${session.date}T12:00:00`) : new Date(session.timestamp || session.startedAt || 0);
      if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return '';
      const mondayOffset = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - mondayOffset);
      return this.getStudyDateKey(date);
    }).filter(Boolean)).size;
    let reviewCount = 0;
    try {
      const daily = JSON.parse(localStorage.getItem('dailyReviews') || '[]');
      const perSession = JSON.parse(localStorage.getItem('sessionReviews') || '[]');
      reviewCount = (Array.isArray(daily) ? daily.length : 0) + (Array.isArray(perSession) ? perSession.length : 0);
    } catch (error) { reviewCount = 0; }

    return { totalSessions, totalMinutes, totalHours, maxDaily, currentStreak, earlyBird, nightOwl, completedTasks, habitCompletions, midnightSession, lunchSession, weekendSessions, perfectTwentyFive, perfectTwentyFiveCount, longestSession, focusDays, categoryCount, endedEarlyCount, reviewCount, earlyBirdCount, nightOwlCount, morningSessions, afternoonSessions, eveningSessions, shortSessions, longSessions, notedSessions, taskLinkedSessions, productiveDays, activeWeeks };
  },

  // ---- Achievements ----

  checkAchievements() {
    const stats = this.getStats();
    const unlockedNow = [];

    this.achievementDefs.forEach(def => {
      if (this.achievements.includes(def.id)) return;
      if (def.check(stats)) {
        this.achievements.push(def.id);
        unlockedNow.push(def);
      }
    });

    if (unlockedNow.length) {
      this.saveState();
      this.updateStreakAndTotal();
      unlockedNow.slice(0, 3).forEach(def => this.showToast(`🏆 解锁成就: ${def.icon} ${def.name}`));
      if (unlockedNow.length > 3) this.showToast(`🎉 本次共解锁 ${unlockedNow.length} 个成就，去成就库看看吧`);
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
    const total = this.achievementDefs.length;
    const unlockedCount = this.achievementDefs.filter(def => this.achievements.includes(def.id)).length;
    document.getElementById('achievement-unlocked-count').textContent = `${unlockedCount} / ${total}`;
    document.getElementById('achievement-summary-progress').style.width = `${total ? Math.round(unlockedCount / total * 100) : 0}%`;
    document.querySelectorAll('[data-achievement-filter]').forEach(button => {
      const active = button.dataset.achievementFilter === this.achievementFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const visibleDefs = this.achievementDefs.filter(def => {
      const unlocked = this.achievements.includes(def.id);
      return this.achievementFilter === 'all' || (this.achievementFilter === 'unlocked' ? unlocked : !unlocked);
    });
    grid.innerHTML = visibleDefs.map(def => {
      const unlocked = this.achievements.includes(def.id);
      const cls = unlocked ? 'unlocked' : 'locked';
      const current = def.metric ? Math.max(0, Number(stats[def.metric]) || 0) : 0;
      const progress = def.target ? Math.min(100, Math.round(current / def.target * 100)) : 0;
      return `
        <article class="achievement-card ${cls}">
          <div class="achievement-icon">${def.icon}</div>
          <div class="achievement-group">${def.group || '特别成就'}</div>
          <div class="achievement-name">${def.name}</div>
          <div class="achievement-desc">${def.desc}</div>
          ${def.target ? `<div class="achievement-progress" aria-label="进度 ${progress}%"><i style="width:${progress}%"></i></div><div class="achievement-progress-text">${Math.min(current, def.target).toLocaleString()} / ${def.target.toLocaleString()} ${def.unit || ''}</div>` : ''}
          ${unlocked ? '<div class="achievement-date">已解锁</div>' : ''}
        </article>
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
