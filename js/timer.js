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
  todayMinutes: 0,
  currentSessionStart: null,

  init() {
    this.loadSettings();
    this.loadTodayData();
    this.bindUI();
    this.render();
    this.updateClock();
    this.updateDate();
    setInterval(() => this.updateClock(), 1000);
  },

  bindUI() {
    document.getElementById('btn-start-pause').addEventListener('click', () => this.toggle());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());

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
    localStorage.setItem('timerSettings', JSON.stringify({
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
    try {
      const data = JSON.parse(localStorage.getItem('dailyData'));
      if (data && data.date === today) {
        this.todayMinutes = data.minutes || 0;
      }
    } catch(e) {}
    this.updateTodayDisplay();
  },

  getDateString() {
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
    this.isRunning = true;
    if (!this.currentSessionStart) {
      this.currentSessionStart = Date.now();
    }

    const btn = document.getElementById('btn-start-pause');
    btn.textContent = '暂停';
    btn.classList.add('break-mode');

    document.querySelector('.timer-sep').classList.remove('paused');
    document.getElementById('timer-status-badge').textContent = this.isWork ? '专注中' : '休息中';

    this.intervalId = setInterval(() => this.tick(), 1000);
  },

  pause() {
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    document.getElementById('btn-start-pause').textContent = '继续';
    document.querySelector('.timer-sep').classList.add('paused');
    document.getElementById('timer-status-badge').textContent = '已暂停';
  },

  reset() {
    this.isRunning = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.currentSessionStart = null;
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
    this.remaining--;
    this.render();

    if (this.remaining <= 0) {
      this.complete();
    }
  },

  complete() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;

    // Play completion sound
    this.playChime();

    if (this.isWork) {
      // Record the completed session
      const durationMinutes = Math.round((Date.now() - this.currentSessionStart) / 60000);
      this.recordSession(durationMinutes);
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

      // Update session dots
      this.updateDots();

      // Show toast
      if (typeof App !== 'undefined') App.showToast('🎉 专注完成！休息一下吧~');

      // Auto-start break after short delay
      setTimeout(() => {
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
        g.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
      });
    } catch(e) {}
  },

  recordSession(durationMinutes) {
    const today = this.getDateString();
    const actualDuration = Math.max(1, durationMinutes || Math.round(this.workDuration / 60));
    this.todayMinutes += actualDuration;

    // Save daily data
    localStorage.setItem('dailyData', JSON.stringify({
      date: today,
      minutes: this.todayMinutes,
    }));

    // Save session record
    let sessions = [];
    try { sessions = JSON.parse(localStorage.getItem('focusSessions') || '[]'); } catch(e) {}
    sessions.push({
      date: today,
      duration: actualDuration,
      type: 'work',
      timestamp: Date.now(),
    });
    localStorage.setItem('focusSessions', JSON.stringify(sessions));

    // Update stats
    if (typeof Stats !== 'undefined') Stats.needsRefresh = true;
    if (typeof App !== 'undefined') {
      App.checkAchievements();
      App.updateStreakAndTotal();
    }

    this.updateTodayDisplay();
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
    document.getElementById('current-clock').textContent =
      now.toLocaleTimeString('zh-CN', { hour12: false });
  },

  updateDate() {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('current-date').textContent =
      `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`;
    // Update date once per hour is fine since we update clock every second
    setTimeout(() => {
      setInterval(() => this.updateDate(), 60000);
    }, (60 - new Date().getSeconds()) * 1000);
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
