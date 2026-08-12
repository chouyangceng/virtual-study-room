/* ============================================
   tasks.js - Task list management
   CRUD operations with localStorage persistence
   ============================================ */

const TaskManager = {
  tasks: [],
  categoryFilter: '',

  init() {
    this.loadTasks();
    this.bindUI();
    this.render();
  },

  loadTasks() {
    try {
      this.tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    } catch(e) {
      this.tasks = [];
    }
  },

  saveTasks() {
    SafeStore.set('tasks', JSON.stringify(this.tasks));
  },

  getTodayKey() {
    return typeof App !== 'undefined' && App.getStudyDateKey ? App.getStudyDateKey() : this.calendarKey();
  },

  calendarKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  refreshDailyState() {
    const today = this.getTodayKey();
    let changed = false;
    this.tasks.forEach(task => {
      if (!task.recurringDaily && task.planId && typeof PlanManager !== 'undefined') {
        const plan = PlanManager.plans.find(item => item.id === task.planId);
        if (plan?.scope === 'daily' && !plan.date) { task.recurringDaily = true; changed = true; }
      }
      if (!task.recurringDaily) return;
      if (task.completedForDate !== today) {
        task.completed = false;
        task.completedAt = null;
        task.completedForDate = today;
        changed = true;
      }
    });
    if (changed) this.saveTasks();
    return changed;
  },

  getVisibleTasks() {
    const today = this.getTodayKey();
    return this.tasks.filter(task => {
      if (task.date && task.date !== today) return false;
      if (task.activeFrom && today < task.activeFrom) return false;
      if (task.activeTo && today > task.activeTo) return false;
      return true;
    });
  },

  bindUI() {
    const input = document.getElementById('task-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addTask();
    });
    document.getElementById('btn-add-task').addEventListener('click', () => this.addTask());
    document.getElementById('btn-clear-completed').addEventListener('click', () => this.clearCompleted());
    document.getElementById('task-category-filter').addEventListener('change', event => { this.categoryFilter = event.target.value; this.render(); });
  },

  addTask() {
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (!text) return;

    this.tasks.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: text,
      completed: false,
      recurringDaily: false,
      completedForDate: '',
      createdAt: Date.now(),
      date: this.getTodayKey(),
      subjectId: typeof SubjectManager !== 'undefined' ? SubjectManager.currentSubjectId : '',
      categoryPath: document.getElementById('task-category-path').value.trim().replace(/\s*[>＞\\]+\s*/g, '/').replace(/^\/+|\/+$/g, ''),
      tags: document.getElementById('task-tags').value.split(/[,，#]+/).map(tag => tag.trim()).filter(Boolean).slice(0, 12),
    });

    input.value = '';
    document.getElementById('task-tags').value = '';
    this.saveTasks();
    this.render();
    if (typeof SubjectManager !== 'undefined') SubjectManager.render();
    input.focus();
  },

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      if (task.completed) {
        task.completedAt = Date.now();
        if (task.recurringDaily) task.completedForDate = this.getTodayKey();
      } else {
        delete task.completedAt;
      }
      this.saveTasks();
      this.render();
      if (typeof SubjectManager !== 'undefined') SubjectManager.render();

      if (task.planId && typeof PlanManager !== 'undefined') {
        PlanManager.syncFromTask(task.planId, task.completed);
      }
      if (task.completed && typeof ReviewManager !== 'undefined') {
        ReviewManager.openForTask(task);
      }

      // Check achievement for completing tasks
      if (task.completed && typeof App !== 'undefined') {
        App.checkAchievements();
      }
    }
  },

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.saveTasks();
    this.render();
    if (typeof SubjectManager !== 'undefined') SubjectManager.render();
  },

  clearCompleted() {
    const hadCompleted = this.tasks.some(t => t.completed);
    if (!hadCompleted) return;
    this.tasks = this.tasks.filter(t => !t.completed);
    this.saveTasks();
    this.render();
  },

  getActiveCount() {
    return this.getVisibleTasks().filter(t => !t.completed).length;
  },

  getCompletedCount() {
    return this.getVisibleTasks().filter(t => t.completed).length;
  },

  render() {
    const list = document.getElementById('task-list');
    const emptyEl = list.querySelector('.task-empty');

    // Sort: incomplete first, then by createdAt desc
    const visible = this.getVisibleTasks();
    this.renderCategoryFilter(visible);
    const sorted = visible.filter(task => !this.categoryFilter || (task.categoryPath || '').startsWith(this.categoryFilter)).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (Number.isFinite(a.order) || Number.isFinite(b.order)) return (a.order ?? 9999) - (b.order ?? 9999);
      return b.createdAt - a.createdAt;
    });

    // Remove existing task items
    list.querySelectorAll('.task-item').forEach(el => el.remove());

    if (sorted.length === 0) {
      if (!emptyEl) {
        const el = document.createElement('li');
        el.className = 'task-empty';
        el.textContent = '✨ 今天暂无任务，添加或导入一个吧';
        list.appendChild(el);
      }
      emptyEl && (emptyEl.style.display = '');
    } else {
      if (emptyEl) emptyEl.style.display = 'none';

      sorted.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item${task.completed ? ' completed' : ''}`;

        const checkbox = document.createElement('button');
        checkbox.className = 'task-checkbox';
        checkbox.textContent = task.completed ? '✓' : '';
        checkbox.addEventListener('click', () => this.toggleTask(task.id));

        const text = document.createElement('span');
        text.className = 'task-text';
        text.textContent = task.text;
        if (task.subjectId && typeof SubjectManager !== 'undefined') {
          const subject = document.createElement('small');
          subject.className = 'task-subject';
          subject.textContent = SubjectManager.getName(task.subjectId);
          text.appendChild(subject);
        }
        if (task.categoryPath || task.tags?.length) {
          const meta = document.createElement('small');
          meta.className = 'task-taxonomy';
          if (task.categoryPath) meta.append(task.categoryPath);
          (task.tags || []).forEach(tag => { const badge = document.createElement('b'); badge.textContent = `#${tag}`; meta.appendChild(badge); });
          text.appendChild(meta);
        }

        const del = document.createElement('button');
        del.className = 'task-delete';
        del.textContent = '×';
        del.addEventListener('click', () => this.deleteTask(task.id));

        li.appendChild(checkbox);
        li.appendChild(text);
        li.appendChild(del);
        list.appendChild(li);
      });
    }

    // Update badge and clear button
    document.getElementById('task-count').textContent = this.getActiveCount();
    const clearBtn = document.getElementById('btn-clear-completed');
    if (this.getCompletedCount() > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  },

  renderCategoryFilter(tasks) {
    const select = document.getElementById('task-category-filter');
    const paths = [...new Set(tasks.flatMap(task => {
      const parts = (task.categoryPath || '').split('/').map(part => part.trim()).filter(Boolean);
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    }))].sort();
    select.innerHTML = '<option value="">全部分类</option>' + paths.map(path => `<option value="${this.escape(path)}">${this.escape(path)}</option>`).join('');
    if (paths.includes(this.categoryFilter)) select.value = this.categoryFilter;
    else this.categoryFilter = '';
  },

  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); },
};
