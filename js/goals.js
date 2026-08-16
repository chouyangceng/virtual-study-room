/* ============================================
   goals.js - Multi goal countdowns
   ============================================ */

const GoalManager = {
  goals: [],
  currentId: '',
  editingId: '',
  timerId: null,

  init() {
    this.load();
    this.bindUI();
    this.render();
    this.startClock();
  },

  load() {
    try {
      const goals = JSON.parse(localStorage.getItem('studyGoals') || '[]');
      this.goals = Array.isArray(goals) ? goals : [];
    } catch (e) {
      this.goals = [];
    }
    this.currentId = localStorage.getItem('currentStudyGoal') || this.goals[0]?.id || '';
  },

  save() {
    SafeStore.set('studyGoals', JSON.stringify(this.goals));
    SafeStore.set('currentStudyGoal', this.currentId || '');
  },

  bindUI() {
    document.getElementById('btn-goals')?.addEventListener('click', () => this.open());
    document.getElementById('btn-open-goals')?.addEventListener('click', () => this.open());
    document.getElementById('goals-modal')?.querySelector('.modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('goals-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());
    document.getElementById('goal-type')?.addEventListener('change', () => this.toggleTypeRows());
    document.getElementById('btn-new-goal')?.addEventListener('click', () => this.clearForm());
    document.getElementById('btn-save-goal')?.addEventListener('click', () => this.saveForm());
    document.getElementById('btn-delete-goal')?.addEventListener('click', () => this.deleteGoal(this.editingId || this.currentId));
  },

  open() {
    this.render();
    document.getElementById('goals-modal')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('goals-modal')?.classList.remove('active');
    document.body.style.overflow = '';
  },

  todayKey() {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey() : this.dateKey(new Date());
  },

  dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },

  startClock() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => this.renderOverview(), 60000);
  },

  render() {
    if (!this.currentId && this.goals.length) this.currentId = this.goals[0].id;
    this.renderList();
    this.renderOverview();
    this.toggleTypeRows();
  },

  renderOverview() {
    const target = document.getElementById('goal-overview-list');
    if (!target) return;
    if (!this.goals.length) {
      target.innerHTML = '<span class="goal-overview-empty">还没有目标，点击“管理”添加</span>';
      return;
    }
    target.innerHTML = this.goals.map(goal => {
      const status = this.getGoalStatus(goal);
      return `<button class="goal-overview-item" type="button" data-id="${this.escape(goal.id)}"><span>${this.escape(goal.name)}</span><strong>${this.escape(status.title)}</strong><small>${this.escape(status.meta)}</small></button>`;
    }).join('');
    target.querySelectorAll('.goal-overview-item').forEach(button => button.addEventListener('click', () => {
      this.open();
      this.editGoal(button.dataset.id);
    }));
  },

  renderList() {
    const list = document.getElementById('goal-list');
    if (!list) return;
    if (!this.goals.length) {
      list.innerHTML = '<p class="goal-empty">先添加一个目标，例如考研倒计时、雅思倒计时或 100 天背单词。</p>';
      return;
    }
    list.innerHTML = this.goals.map(goal => {
      const status = this.getGoalStatus(goal);
      const active = goal.id === this.currentId ? 'active' : '';
      return `<button class="goal-item ${active}" type="button" data-id="${this.escape(goal.id)}">
        <span>${this.escape(goal.name)}</span>
        <strong>${this.escape(status.title)}</strong>
        <small>${this.escape(status.meta)}</small>
      </button>`;
    }).join('');
    list.querySelectorAll('.goal-item').forEach(button => {
      button.addEventListener('click', () => this.editGoal(button.dataset.id));
    });
  },

  editGoal(id) {
    const goal = this.goals.find(item => item.id === id);
    if (!goal) return;
    this.currentId = id;
    this.editingId = id;
    document.getElementById('goal-name').value = goal.name || '';
    document.getElementById('goal-type').value = goal.type || 'date';
    document.getElementById('goal-date').value = goal.date || '';
    document.getElementById('goal-start').value = goal.start || this.todayKey();
    document.getElementById('goal-days').value = goal.days || 30;
    this.save();
    this.render();
  },

  clearForm() {
    this.editingId = '';
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-type').value = 'date';
    document.getElementById('goal-date').value = '';
    document.getElementById('goal-start').value = this.todayKey();
    document.getElementById('goal-days').value = 30;
    this.toggleTypeRows();
  },

  saveForm() {
    const name = document.getElementById('goal-name').value.trim();
    const type = document.getElementById('goal-type').value;
    const date = document.getElementById('goal-date').value;
    const start = document.getElementById('goal-start').value || this.todayKey();
    const days = Math.max(1, Number(document.getElementById('goal-days').value) || 30);
    if (!name) return App?.showToast?.('请填写目标名称');
    if (type === 'date' && !date) return App?.showToast?.('请选择目标日期');

    const goal = { id: this.editingId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, type, date, start, days };
    const index = this.goals.findIndex(item => item.id === goal.id);
    if (index >= 0) this.goals[index] = goal;
    else this.goals.push(goal);
    this.currentId = goal.id;
    this.editingId = goal.id;
    this.save();
    this.render();
    App?.showToast?.('目标已保存');
  },

  deleteGoal(id) {
    if (!id) return;
    const goal = this.goals.find(item => item.id === id);
    if (!goal || !window.confirm(`删除目标「${goal.name}」？`)) return;
    this.goals = this.goals.filter(item => item.id !== id);
    this.currentId = this.goals[0]?.id || '';
    this.editingId = '';
    this.save();
    this.clearForm();
    this.render();
    App?.showToast?.('目标已删除');
  },

  toggleTypeRows() {
    const type = document.getElementById('goal-type')?.value || 'date';
    document.getElementById('goal-date-row')?.classList.toggle('hidden', type !== 'date');
    document.getElementById('goal-streak-row')?.classList.toggle('hidden', type !== 'streak');
  },

  getGoalStatus(goal) {
    const today = new Date(`${this.todayKey()}T12:00:00`);
    const target = goal.type === 'streak'
      ? this.addDays(new Date(`${goal.start || this.todayKey()}T12:00:00`), (Number(goal.days) || 1) - 1)
      : new Date(`${goal.date}T12:00:00`);
    const left = Math.ceil((target - today) / 86400000);
    const done = goal.type === 'streak'
      ? Math.max(0, Math.min(Number(goal.days) || 1, Math.floor((today - new Date(`${goal.start || this.todayKey()}T12:00:00`)) / 86400000) + 1))
      : null;
    if (left < 0) return { title: '已到期', meta: `目标日 ${this.dateKey(target)}` };
    if (goal.type === 'streak') return { title: `还剩 ${left} 天`, meta: `已坚持 ${done}/${goal.days} 天` };
    return { title: `还剩 ${left} 天`, meta: `目标日 ${this.dateKey(target)}` };
  },

  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  },
};
