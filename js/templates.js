/* Downloadable import templates for unified tasks, weekly/monthly plans and courses. */
const TemplateManager = {
  version: '2026.08',
  rows: {
    guide: [
      ['虚拟自习室统一导入模板', '版本', '2026.08'],
      ['使用步骤', '1. 按示例填写；2. 不修改表头；3. 回到“导入与模板”选择文件；4. 勾选要导入的内容。'],
      ['任务类型', '今日任务 / 每日坚持 / 周计划 / 月计划'],
      ['日期规则', '今日任务可填 YYYY-MM-DD；每日坚持留空；周计划填写周次；月计划填写 YYYY-MM。'],
      ['分类建议', '使用斜杠分级，例如：数学/高数/极限；标签用逗号分隔。'],
      ['学习日边界', '每天早上 8:00 刷新每日坚持。'],
    ],
    plans: [
      ['任务内容', '详细说明', '类型', '日期', '周次', '星期', '月份', '分类路径', '标签'],
      ['背 50 个英语单词', '完成后在每日任务中打卡', '每日坚持', '', '', '', '', '英语/词汇', '基础'],
      ['完成高数错题 20 题', '订正并整理错因', '今日任务', '2026-08-14', '', '', '', '数学/高数', '错题'],
      ['本周完成线代第二章', '看课、例题、错题各一轮', '周计划', '', '1', '周日', '', '数学/线代', '周目标'],
      ['八月完成控制基础一轮', '每周验收一次', '月计划', '', '', '', '2026-08', '822控制', '月目标'],
      ['完成阅读真题 2 篇', '逐句分析并记录生词', '今日任务', '2026-08-14', '', '', '', '英语/阅读', '真题,精读'],
    ],
    courses: [
      ['课程名称', '课程号/班号', '教师', '星期', '节次', '开始时间', '结束时间', '起始周', '结束周', '教室', '备注'],
      ['车辆控制理论A', '20261-04654[01]', '示例教师', '星期四', '第一节-第二节', '08:00', '09:40', 1, 8, '东院-101', '必修'],
    ],
  },

  download(type = 'all') {
    if (!window.XLSX) {
      if (typeof App !== 'undefined') App.showToast('模板组件尚未加载，请稍后再试');
      return;
    }
    const workbook = XLSX.utils.book_new();
    const names = { guide: '填写说明', plans: '任务与计划', courses: '课表' };
    const widths = {
      guide: [24, 72, 14],
      plans: [24, 34, 14, 14, 10, 10, 12, 24, 20],
      courses: [22, 20, 14, 12, 18, 12, 12, 10, 10, 18, 20],
    };
    const keys = type === 'courses' ? ['guide', 'courses'] : ['guide', 'plans', 'courses'];
    keys.forEach(key => {
      const sheet = XLSX.utils.aoa_to_sheet(this.rows[key]);
      sheet['!cols'] = widths[key].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, sheet, names[key]);
    });
    const filename = type === 'courses' ? '虚拟自习室-最新版课表模板.xlsx' : '虚拟自习室-最新版统一导入模板.xlsx';
    XLSX.writeFile(workbook, filename);
    if (typeof App !== 'undefined') App.showToast('模板已下载');
  },
};
