/* ============================================
   timer.js - Pomodoro Timer
   Core countdown logic, session tracking, auto-switch
   ============================================ */

const PomodoroTimer = {
  workDuration: 25 * 60,    // seconds
  breakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  sessionsBeforeLongBreak: 4,

  remaining: 25 * 60,
  total: 25 * 60,
  isRunning: false,
  isWork: true,
  sessionCount: 0,
  intervalId: null,
  dateIntervalId: null,
  breakAutoTimer: null,
  generation: 0,
  todayMinutes: 0,
  todayDataDate: null,
  currentSessionStart: null,
  activeSeconds: 0,
  lastTickAt: null,
  endAt: null,
  currentSessionName: '',
  currentSessionDetail: '',
  currentSessionSubjectId: '',

  init() {
    this.loadSettings();
    this.loadTodayData();
    this.bindUI();
    this.render();
    this.updateClock();
    this.updateDate();
    setInterval(() => this.updateClock(), 1000);
    if (this.dateIntervalId) clearInterval(this.dateIntervalId);
    this.dateIntervalId = setInterval(() => this.updateDate(), 60000);
  },

  bindUI() {
    document.getElementById('btn-start-pause').addEventListener('click', () => this.toggle());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());
    document.getElementById('session-task-input')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !this.isRunning) this.toggle();
    });
    document.getElementById('session-subject-select')?.addEventListener('change', event => {
      if (typeof SubjectManager !== 'undefined') {
        SubjectManager.currentSubjectId = event.target.value;
        SafeStore.set('currentSubjectId', event.target.value);
      }
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const w = parseInt(btn.dataset.work);
        const b = parseInt(btn.dataset.break);
        this.setDurations(w, b);
        this.reset();
      });
    });

    document.getElementById('btn-apply-custom').addEventListener('click', () => {
      const w = parseInt(document.getElementById('custom-work').value) || 25;
      const b = parseInt(document.getElementById('custom-break').value) || 5;
      this.setDurations(Math.max(1, Math.min(120, w)), Math.max(1, Math.min(60, b)));
      document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
      this.reset();
    });
  },

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('timerSettings'));
      if (s) {
        this.workDuration = s.workDuration ?? 25 * 60;
        this.breakDuration = s.breakDuration ?? 5 * 60;
        this.longBreakDuration = s.longBreakDuration ?? 15 * 60;
        this.sessionsBeforeLongBreak = s.sessionsBeforeLongBreak ?? 4;
        this.sessionCount = s.sessionCount ?? 0;
        this.isWork = s.isWork ?? true;
      }
    } catch(e) {}
    this.remaining = this.isWork ? this.workDuration : this.breakDuration;
    this.total = this.remaining;

    // Restore custom inputs
    document.getElementById('custom-work').value = this.workDuration / 60;
    document.getElementById('custom-break').value = this.breakDuration / 60;
  },

  saveSettings() {
    SafeStore.set('timerSettings', JSON.stringify({
      workDuration: this.workDuration,
      breakDuration: this.breakDuration,
      longBreakDuration: this.longBreakDuration,
      sessionsBeforeLongBreak: this.sessionsBeforeLongBreak,
      sessionCount: this.sessionCount,
      isWork: this.isWork,
    }));
  },

  loadTodayData() {
    const today = this.getDateString();
    this.todayDataDate = today;
    this.todayMinutes = 0;
    try {
      const data = JSON.parse(localStorage.getItem('dailyData'));
      if (data && data.date === today) {
        this.todayMinutes = data.minutes || 0;
      }
    } catch(e) {}
    this.updateTodayDisplay();
  },

  getDateString() {
    if (typeof App !== 'undefined' && App.getStudyDateKey) return App.getStudyDateKey();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  setDurations(workMin, breakMin) {
    this.workDuration = workMin * 60;
    this.breakDuration = breakMin * 60;
    this.remaining = this.workDuration;
    this.total = this.workDuration;
    this.isWork = true;
    this.saveSettings();
  },

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  },

  start() {
    if (AudioEngine.ctx && AudioEngine.ctx.state === 'suspended') AudioEngine.ctx.resume();
    if (this.isWork && !this.currentSessionName) {
      const input = document.getElementById('session-task-input');
      const typed = input?.value.trim() || '';
      const confirmed = typed || window.prompt('确认本次专注的小任务名称：', '')?.trim();
      if (!confirmed) {
        if (typeof App !== 'undefined') App.showToast('请先填写这次要完成的小任务');
        input?.focus();
        return;
      }
      this.currentSessionName = confirmed;
      this.currentSessionDetail = typed ? typed : confirmed;
      this.currentSessionSubjectId = document.getElementById('session-subject-select')?.value || (typeof SubjectManager !== 'undefined' ? SubjectManager.currentSubjectId : '');
      if (input) input.value = confirmed;
    }
    this.isRunning = true;
    if (!this.currentSessionStart) {
      this.currentSessionStart = Date.now();
      if (this.isWork) this.recordActivity('attempts');
    }
    this.lastTickAt = Date.now();
    this.endAt = this.lastTickAt + this.remaining * 1000;

    const btn = document.getElementById('btn-start-pause');
    btn.textContent = '暂停';
    btn.classList.add('break-mode');

    document.querySelector('.timer-sep').classList.remove('paused');
    document.getElementById('timer-status-badge').textContent = this.isWork ? '专注中' : '休息中';

    this.intervalId = setInterval(() => this.tick(), 1000);
  },

  pause() {
    this.syncElapsed();
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    document.getElementById('btn-start-pause').textContent = '继续';
    document.querySelector('.timer-sep').classList.add('paused');
    document.getElementById('timer-status-badge').textContent = '已暂停';
  },

  reset() {
    if (this.isRunning) this.syncElapsed();
    this.generation++;
    if (this.breakAutoTimer) { clearTimeout(this.breakAutoTimer); this.breakAutoTimer = null; }
    if (this.isWork && this.currentSessionStart && this.activeSeconds >= 5) {
      this.recordActivity('interruptions');
    }
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.currentSessionStart = null;
    this.activeSeconds = 0;
    this.currentSessionName = '';
    this.currentSessionDetail = '';
    this.currentSessionSubjectId = '';
    this.lastTickAt = null;
    this.endAt = null;
    this.remaining = this.isWork ? this.workDuration : this.breakDuration;
    this.total = this.remaining;

    document.getElementById('btn-start-pause').textContent = this.isWork ? '开始专注' : '开始休息';
    document.getElementById('btn-start-pause').classList.remove('break-mode');
    document.querySelector('.timer-sep').classList.add('paused');
    document.getElementById('timer-status-badge').textContent = '就绪';
    document.getElementById('timer-label').textContent = this.isWork ? '专注时间' : '休息时间';

    this.render();
  },

  tick() {
    if (!this.isRunning) return;
    const now = Date.now();
    this.remaining = Math.max(0, Math.ceil((this.endAt - now) / 1000));
    this.render();

    if (this.remaining <= 0) {
      this.complete();
    }
  },

  syncElapsed() {
    if (!this.isRunning || !this.lastTickAt) return;
    const now = Date.now();
    this.activeSeconds += Math.max(0, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;
    if (this.endAt) this.remaining = Math.max(0, Math.ceil((this.endAt - now) / 1000));
  },

  complete() {
    this.syncElapsed();
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    // Play completion sound
    this.playChime();

    if (this.isWork) {
      // Record the completed session
      const durationMinutes = Math.max(1, Math.round(this.activeSeconds / 60));
      this.recordSession(durationMinutes, this.currentSessionStart);
      this.currentSessionName = '';
      this.currentSessionDetail = '';
      this.currentSessionSubjectId = '';
      this.sessionCount++;

      // Determine next break type
      const isLongBreak = this.sessionCount % this.sessionsBeforeLongBreak === 0;
      this.isWork = false;
      this.remaining = isLongBreak ? this.longBreakDuration : this.breakDuration;
      this.total = this.remaining;

      document.getElementById('timer-label').textContent = isLongBreak ? '长休息' : '休息时间';
      document.getElementById('timer-status-badge').textContent = isLongBreak ? '长休息' : '休息';
      document.getElementById('timer-status-badge').classList.add('break');
      document.getElementById('btn-start-pause').classList.add('break-mode');
      document.getElementById('btn-start-pause').textContent = '开始休息';
      const sessionInput = document.getElementById('session-task-input');
      if (sessionInput) sessionInput.value = '';

      // Update session dots
      this.updateDots();

      // Show toast
      if (typeof App !== 'undefined') App.showToast('🎉 专注完成！休息一下吧~');

      // Auto-start break after short delay
      const generationAtComplete = this.generation;
      this.breakAutoTimer = setTimeout(() => {
        this.breakAutoTimer = null;
        if (generationAtComplete !== this.generation) return;
        if (!this.isRunning && !this.isWork) {
          this.start();
        }
      }, 1500);
    } else {
      // Break complete
      this.isWork = true;
      this.remaining = this.workDuration;
      this.total = this.remaining;

      document.getElementById('timer-label').textContent = '专注时间';
      document.getElementById('timer-status-badge').textContent = '就绪';
      document.getElementById('timer-status-badge').classList.remove('break');
      document.getElementById('btn-start-pause').classList.remove('break-mode');
      document.getElementById('btn-start-pause').textContent = '开始专注';

      if (typeof App !== 'undefined') App.showToast('⏰ 休息结束，开始新的专注！');
    }

    this.currentSessionStart = null;
    this.activeSeconds = 0;
    this.lastTickAt = null;
    this.endAt = null;
    this.render();
    this.saveSettings();
  },

  playChime() {
    try {
      const ctx = AudioEngine.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = this.isWork ? [523, 659, 784] : [784, 659, 523]; // C5 E5 G5 or reverse
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.15, now + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
        osc.connect(g);
        g.connect(AudioEngine.masterGain || ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      });
    } catch(e) {}
  },

  recordSession(durationMinutes, startedAt = null) {
    const today = this.getDateString();
    if (this.todayDataDate !== today) this.loadTodayData();
    const actualDuration = Math.max(1, durationMinutes || Math.round(this.workDuration / 60));
    this.todayMinutes += actualDuration;

    // Save daily data
    SafeStore.set('dailyData', JSON.stringify({
      date: today,
      minutes: this.todayMinutes,
    }));

    // Save session record
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('focusSessions') || '[]'); } catch(e) {}
    if (!Array.isArray(sessions)) sessions = [];
    if (sessions.length >= 5000) {
      sessions = sessions.slice(-4000);
      if (typeof App !== 'undefined') App.showToast('⚠️ 专注记录已达上限，最早的记录已自动清理。请定期导出备份。');
    }
    const subjectId = this.currentSessionSubjectId || (typeof SubjectManager !== 'undefined' ? SubjectManager.currentSubjectId : '');
    sessions.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date: today,
      duration: actualDuration,
      type: 'work',
      timestamp: Date.now(),
      startedAt: startedAt || Date.now(),
      sessionName: this.currentSessionName || '未命名专注',
      sessionDetail: this.currentSessionDetail || this.currentSessionName || '',
      subjectId,
      subjectName: subjectId && typeof SubjectManager !== 'undefined' ? SubjectManager.getName(subjectId) : '未分类',
    });
    SafeStore.set('focusSessions', JSON.stringify(sessions));

    // Update stats
    if (typeof Stats !== 'undefined') Stats.needsRefresh = true;
    if (typeof App !== 'undefined') {
      App.checkAchievements();
      App.updateStreakAndTotal();
    }

    this.updateTodayDisplay();
  },

  recordActivity(field) {
    let activity = {};
    try { activity = JSON.parse(localStorage.getItem('focusActivity') || '{}'); } catch (e) {}
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) activity = {};
    const today = this.getDateString();
    const day = activity[today] || { attempts: 0, interruptions: 0 };
    day[field] = (Number(day[field]) || 0) + 1;
    activity[today] = day;
    SafeStore.set('focusActivity', JSON.stringify(activity));
  },

  updateDots() {
    const dots = document.querySelectorAll('#session-dots .dot');
    const count = this.sessionCount % this.sessionsBeforeLongBreak;
    dots.forEach((dot, i) => {
      if (i < count) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });
  },

  updateTodayDisplay() {
    document.getElementById('today-focus-time').textContent =
      `今日专注: ${this.todayMinutes} 分钟`;
  },

  updateClock() {
    const now = new Date();
    if (this.todayDataDate && this.todayDataDate !== this.getDateString()) {
      this.loadTodayData();
    }
    document.getElementById('current-clock').textContent =
      now.toLocaleTimeString('zh-CN', { hour12: false });
  },

  updateDate() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('current-date').textContent =
      `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`;
  },

  render() {
    const mins = Math.floor(this.remaining / 60);
    const secs = this.remaining % 60;
    document.getElementById('timer-minutes').textContent = String(mins).padStart(2, '0');
    document.getElementById('timer-seconds').textContent = String(secs).padStart(2, '0');

    // Update SVG ring
    const progress = this.remaining / this.total;
    const circumference = 553; // 2 * PI * 88
    const offset = circumference * (1 - progress);
    const ring = document.querySelector('.ring-progress');
    ring.style.strokeDashoffset = offset;
    ring.style.stroke = this.isWork ? 'var(--ring-progress)' : 'var(--break-color)';
  },
};
