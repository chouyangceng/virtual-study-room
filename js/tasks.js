/* ============================================
   tasks.js - Task list management
   CRUD operations with localStorage persistence
   ============================================ */

const TaskManager = {
  tasks: [],

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
    localStorage.setItem('tasks', JSON.stringify(this.tasks));
  },

  bindUI() {
    const input = document.getElementById('task-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addTask();
    });
    document.getElementById('btn-add-task').addEventListener('click', () => this.addTask());
    document.getElementById('btn-clear-completed').addEventListener('click', () => this.clearCompleted());
  },

  addTask() {
    const input = document.getElementById('task-input');
    const text = input.value.trim();
    if (!text) return;

    this.tasks.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      text: text,
      completed: false,
      createdAt: Date.now(),
    });

    input.value = '';
    this.saveTasks();
    this.render();
    input.focus();
  },

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      if (task.completed) {
        task.completedAt = Date.now();
      } else {
        delete task.completedAt;
      }
      this.saveTasks();
      this.render();

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
  },

  clearCompleted() {
    const hadCompleted = this.tasks.some(t => t.completed);
    if (!hadCompleted) return;
    this.tasks = this.tasks.filter(t => !t.completed);
    this.saveTasks();
    this.render();
  },

  getActiveCount() {
    return this.tasks.filter(t => !t.completed).length;
  },

  getCompletedCount() {
    return this.tasks.filter(t => t.completed).length;
  },

  render() {
    const list = document.getElementById('task-list');
    const emptyEl = list.querySelector('.task-empty');

    // Sort: incomplete first, then by createdAt desc
    const sorted = [...this.tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt - a.createdAt;
    });

    // Remove existing task items
    list.querySelectorAll('.task-item').forEach(el => el.remove());

    if (sorted.length === 0) {
      if (!emptyEl) {
        const el = document.createElement('li');
        el.className = 'task-empty';
        el.textContent = '✨ 暂无任务，添加一个吧';
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
};
