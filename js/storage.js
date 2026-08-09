/* ============================================
   storage.js - Safe localStorage helpers
   Wraps every write so quota errors never
   silently discard data.
   ============================================ */

const SafeStore = {
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (typeof App !== 'undefined') {
        App.showToast('⚠️ 本地存储已满，本次数据可能未保存。请导出备份并清理历史记录。');
      } else {
        console.warn(`localStorage 写入失败: ${key}`, error);
      }
      return false;
    }
  },
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) { /* ignore */ }
  },
};
