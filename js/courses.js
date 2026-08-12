/* ============================================
   courses.js - WHUT timetable import and free-time map
   ============================================ */

const CourseManager = {
  courses: [],
  periods: [
    { key: '1-2', label: '第一节-第二节', start: '08:00', end: '09:40' },
    { key: '3-5', label: '第三节-第五节', start: '10:00', end: '12:25' },
    { key: '6-8', label: '第六节-第八节', start: '14:00', end: '16:25' },
    { key: '9-10', label: '第九节-第十节', start: '16:45', end: '18:20' },
    { key: '11-13', label: '第十一节-第十三节', start: '19:00', end: '21:25' },
  ],
  days: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],

  init() {
    this.load();
    this.bindUI();
  },

  load() { try { this.courses = JSON.parse(localStorage.getItem('courses') || '[]'); } catch (e) { this.courses = []; } if (!Array.isArray(this.courses)) this.courses = []; },
  save() { SafeStore.set('courses', JSON.stringify(this.courses)); },

  bindUI() {
    const modal = document.getElementById('courses-modal');
    document.getElementById('btn-courses').addEventListener('click', () => this.open());
    modal.querySelector('.modal-close').addEventListener('click', () => this.close());
    modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
    document.getElementById('btn-import-courses').addEventListener('click', () => document.getElementById('course-file-input').click());
    document.getElementById('course-file-input').addEventListener('change', event => { if (event.target.files[0]) this.importFile(event.target.files[0]); event.target.value = ''; });
    document.getElementById('btn-download-course-template').addEventListener('click', () => TemplateManager.download('all'));
    document.getElementById('course-week').addEventListener('input', () => this.render());
    document.getElementById('btn-clear-courses').addEventListener('click', () => { this.courses = []; this.save(); this.render(); if (typeof App !== 'undefined') App.showToast('已清空课表'); });
  },

  open() { document.getElementById('courses-modal').classList.add('active'); document.body.style.overflow = 'hidden'; this.render(); },
  close() { document.getElementById('courses-modal').classList.remove('active'); document.body.style.overflow = ''; },
  text(value) { return String(value ?? '').replace(/⼀/g, '一').replace(/⼆/g, '二').replace(/⼤/g, '大').trim(); },
  escape(value) { return this.text(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  num(value) {
    if (/^\d+$/.test(String(value))) return Number(value);
    const text = String(value || '').trim();
    if (!text) return 0;
    const single = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (text === '十') return 10;
    if (text.startsWith('十')) return 10 + (single[text.slice(1)] || 0);
    if (text.endsWith('十')) return (single[text.slice(0, 1)] || 0) * 10;
    return single[text] || 0;
  },
  day(value) { const m = this.text(value).match(/星期\s*([1-7一二三四五六日天])/); if (!m) return 0; return /[一二三四五六日天]/.test(m[1]) ? ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[m[1]]) : Number(m[1]); },
  period(value) { const v = this.text(value); const m = v.match(/第?([一二三四五六七八九十]+)节\s*[-—至]\s*第?([一二三四五六七八九十]+)节/); if (!m) { const n = v.match(/(\d+)\s*[-—]\s*(\d+)/); return n ? `${n[1]}-${n[2]}` : ''; } return `${this.num(m[1])}-${this.num(m[2])}`; },
  timeMinutes(value) { const m = this.text(value).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; },
  periodInfo(key) { return this.periods.find(p => p.key === key) || this.periods[0]; },

  parseCourse(raw, fallbackPeriod = '') {
    const value = this.text(raw).replace(/\s+/g, ' ');
    if (!value || /^(课程名称|星期|学期课表)$/.test(value)) return null;
    const week = value.match(/(\d+)\s*[-—至]\s*(\d+)周/);
    const day = this.day(value);
    const periodKey = this.period(value) || fallbackPeriod;
    if (!week || !day) return null;
    if (!periodKey) { if (typeof App !== 'undefined') App.showToast('⚠️ 部分课程未识别节次，已跳过（请检查“第X节-第Y节”格式）'); return null; }
    const weekIndex = week.index;
    const prefix = value.slice(0, weekIndex).trim();
    const titleMatch = prefix.match(/^(.+?)(?:\s*\[[^\]]+\])?\s+(.+)$/);
    const title = (titleMatch ? titleMatch[1] : prefix).replace(/\s*\[[^\]]+\]\s*$/, '').trim();
    const teacher = titleMatch ? titleMatch[2].trim() : '';
    const periodMatch = value.match(/第?[一二三四五六七八九十]+节\s*[-—至]\s*第?[一二三四五六七八九十]+节|\d+\s*[-—]\s*\d+节/);
    const location = periodMatch ? value.slice((periodMatch.index || 0) + periodMatch[0].length).replace(/^\s*[,，]/, '').trim() : '';
    const info = this.periodInfo(periodKey);
    return { id: `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: title, teacher, weekday: day, period: periodKey, startTime: info.start, endTime: info.end, startWeek: Number(week[1]), endWeek: Number(week[2]), location, raw: value };
  },

  async importFile(file) {
    if (!window.XLSX) { if (typeof App !== 'undefined') App.showToast('Excel 解析模块未加载，请确认网络后刷新页面'); return; }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames.find(name => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', range: 0 });
        return rows.slice(0, 8).some(row => row.some(cell => ['课程名称', '课程号/班号', '星期一'].includes(String(cell).trim())));
      }) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      let currentPeriod = '';
      const parsed = [];
      const headerRow = rows.findIndex(row => row.some(cell => /课程名称/.test(this.text(cell))));
      if (headerRow >= 0) {
        const headers = rows[headerRow].map(cell => this.text(cell));
        const idx = words => headers.findIndex(h => words.some(word => h.includes(word)));
        const get = (row, words) => { const i = idx(words); return i >= 0 ? this.text(row[i]) : ''; };
        rows.slice(headerRow + 1).forEach(row => {
          const name = get(row, ['课程名称']); if (!name) return;
          const periodText = get(row, ['节次']);
          const periodKey = this.period(periodText) || (/第一/.test(periodText) ? '1-2' : /第三/.test(periodText) ? '3-5' : /第六/.test(periodText) ? '6-8' : /第九/.test(periodText) ? '9-10' : /第十一|晚课/.test(periodText) ? '11-13' : '');
          if (!periodKey) { if (typeof App !== 'undefined') App.showToast(`⚠️ 课程“${name}”缺少节次信息，已跳过`); return; }
          const info = this.periodInfo(periodKey);
          parsed.push({ id: `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, code: get(row, ['课程号', '班号']), teacher: get(row, ['教师']), weekday: this.day(get(row, ['星期'])), period: periodKey, startTime: get(row, ['开始时间']) || info.start, endTime: get(row, ['结束时间']) || info.end, startWeek: Number(get(row, ['起始周'])) || 1, endWeek: Number(get(row, ['结束周'])) || 18, location: get(row, ['教室']), raw: row.join(' ') });
        });
      } else rows.forEach(row => {
          const first = this.text(row[0]);
          const periodCandidate = this.period(first);
          if (periodCandidate) currentPeriod = periodCandidate;
          row.slice(1).forEach(cell => { const course = this.parseCourse(cell, currentPeriod); if (course) parsed.push(course); });
        });
      const unique = new Map();
      parsed.forEach(course => unique.set(`${course.name}|${course.weekday}|${course.period}|${course.startWeek}|${course.endWeek}`, course));
      this.courses = [...unique.values()]; this.save(); this.render();
      if (typeof App !== 'undefined') App.showToast(`📅 已导入 ${this.courses.length} 门课的时间安排`);
      return this.courses.length;
    } catch (error) { if (typeof App !== 'undefined') App.showToast(`课表导入失败：${error.message}`); return 0; }
  },

  activeCourses() { const week = Number(document.getElementById('course-week').value) || 1; return this.courses.filter(c => week >= c.startWeek && week <= c.endWeek); },
  render() {
    const active = this.activeCourses();
    const grid = document.getElementById('course-grid');
    const cells = this.periods.map(period => `<div class="course-period-label"><strong>${period.label}</strong><small>${period.start}-${period.end}</small></div>${this.days.map((day, index) => { const items = active.filter(c => c.weekday === index + 1 && c.period === period.key); return `<div class="course-cell${items.length ? ' occupied' : ' free'}">${items.length ? items.map(c => `<strong>${this.escape(c.name)}</strong><small>${this.escape(c.teacher || '')}</small><em>${this.escape(c.location || '')}</em>`).join('') : '<span>空闲</span>'}</div>`; }).join('')}`).join('');
    grid.innerHTML = `<div class="course-grid-head"><span>节次</span>${this.days.map(day => `<strong>${day}</strong>`).join('')}</div>${cells}`;
    const occupied = active.length;
    document.getElementById('course-summary').textContent = `第 ${Number(document.getElementById('course-week').value) || 1} 周 · ${occupied} 个上课时段 · 空闲时段可用于自动排程`;
    const free = this.days.map((day, index) => { const slots = this.periods.filter(p => !active.some(c => c.weekday === index + 1 && c.period === p.key)); return slots.length ? `<div><strong>${day}</strong><span>${slots.map(p => `${p.start}-${p.end}`).join('、')}</span></div>` : ''; }).join('');
    document.getElementById('free-time-list').innerHTML = free || '<p>本周没有完整空闲时段，请切换周次或清理课表。</p>';
  },
};
