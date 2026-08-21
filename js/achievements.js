'use strict';

const AchievementCatalog = (() => {
  const milestoneSeries = ({ idPrefix, group, metric, icon, unit, items }) => items.map(([target, name]) => ({
    id: `${idPrefix}_${target}`,
    group,
    metric,
    target,
    unit,
    name,
    desc: `${group}达到 ${target.toLocaleString()} ${unit}`,
    icon,
    check: stats => (Number(stats[metric]) || 0) >= target,
  }));

  const base = [
    { id: 'first_session', group: '专注次数', name: '初次专注', desc: '完成第 1 次番茄钟', icon: '🍅', metric: 'totalSessions', target: 1, unit: '次', check: s => s.totalSessions >= 1 },
    { id: 'ten_sessions', group: '专注次数', name: '专注新手', desc: '完成 10 次番茄钟', icon: '⭐', metric: 'totalSessions', target: 10, unit: '次', check: s => s.totalSessions >= 10 },
    { id: 'fifty_sessions', group: '专注次数', name: '专注达人', desc: '完成 50 次番茄钟', icon: '🌟', metric: 'totalSessions', target: 50, unit: '次', check: s => s.totalSessions >= 50 },
    { id: 'hundred_sessions', group: '专注次数', name: '番茄大师', desc: '完成 100 次番茄钟', icon: '👑', metric: 'totalSessions', target: 100, unit: '次', check: s => s.totalSessions >= 100 },
    { id: 'one_hour_today', group: '单日纪录', name: '一小时挑战', desc: '单日专注超过 1 小时', icon: '⏱️', metric: 'maxDaily', target: 60, unit: '分钟', check: s => s.maxDaily >= 60 },
    { id: 'three_hour_today', group: '单日纪录', name: '深度专注', desc: '单日专注超过 3 小时', icon: '🔥', metric: 'maxDaily', target: 180, unit: '分钟', check: s => s.maxDaily >= 180 },
    { id: 'six_hour_today', group: '单日纪录', name: '学霸附体', desc: '单日专注超过 6 小时', icon: '📚', metric: 'maxDaily', target: 360, unit: '分钟', check: s => s.maxDaily >= 360 },
    { id: 'streak_3', group: '连续坚持', name: '三日坚持', desc: '连续 3 天专注', icon: '📅', metric: 'currentStreak', target: 3, unit: '天', check: s => s.currentStreak >= 3 },
    { id: 'streak_7', group: '连续坚持', name: '一周习惯', desc: '连续 7 天专注', icon: '🗓️', metric: 'currentStreak', target: 7, unit: '天', check: s => s.currentStreak >= 7 },
    { id: 'streak_30', group: '连续坚持', name: '月度自律', desc: '连续 30 天专注', icon: '🏅', metric: 'currentStreak', target: 30, unit: '天', check: s => s.currentStreak >= 30 },
    { id: 'early_bird', group: '特别时段', name: '早起鸟儿', desc: '早上 8 点前完成专注', icon: '🌅', check: s => s.earlyBird },
    { id: 'night_owl', group: '特别时段', name: '夜猫子', desc: '晚上 10 点后完成专注', icon: '🦉', check: s => s.nightOwl },
    { id: 'task_master', group: '任务完成', name: '任务达人', desc: '完成 10 个任务', icon: '✅', metric: 'completedTasks', target: 10, unit: '个', check: s => s.completedTasks >= 10 },
    { id: 'task_centurion', group: '任务完成', name: '任务收割机', desc: '完成 100 个任务', icon: '🏆', metric: 'completedTasks', target: 100, unit: '个', check: s => s.completedTasks >= 100 },
    { id: 'total_10h', group: '累计时长', name: '积累者', desc: '累计专注 10 小时', icon: '⏳', metric: 'totalHours', target: 10, unit: '小时', check: s => s.totalHours >= 10 },
    { id: 'total_100h', group: '累计时长', name: '修行者', desc: '累计专注 100 小时', icon: '🧘', metric: 'totalHours', target: 100, unit: '小时', check: s => s.totalHours >= 100 },
    { id: 'total_500h', group: '累计时长', name: '苦行僧', desc: '累计专注 500 小时', icon: '🏔️', metric: 'totalHours', target: 500, unit: '小时', check: s => s.totalHours >= 500 },
    { id: 'tomato_crate', group: '专注次数', name: '番茄批发商', desc: '完成 25 次番茄钟，已经不是零售规模', icon: '🧺', metric: 'totalSessions', target: 25, unit: '次', check: s => s.totalSessions >= 25 },
    { id: 'focus_404', group: '专注次数', name: '摸鱼页面不存在', desc: '完成 404 次专注，摸鱼请求返回 Not Found', icon: '🖥️', metric: 'totalSessions', target: 404, unit: '次', check: s => s.totalSessions >= 404 },
    { id: 'focus_666', group: '专注次数', name: '专注上头', desc: '完成 666 次专注，计时器开始怕你', icon: '😈', metric: 'totalSessions', target: 666, unit: '次', check: s => s.totalSessions >= 666 },
    { id: 'human_timer', group: '累计时长', name: '人形计时器', desc: '累计专注 1,000 小时，体内可能有石英晶振', icon: '🤖', metric: 'totalHours', target: 1000, unit: '小时', check: s => s.totalHours >= 1000 },
    { id: 'chair_welded', group: '单日纪录', name: '椅子焊住了', desc: '单日专注达到 8 小时，建议起来走两步', icon: '🪑', metric: 'maxDaily', target: 480, unit: '分钟', check: s => s.maxDaily >= 480 },
    { id: 'other_side_early_bird', group: '特别时段', name: '地球另一边的早起', desc: '凌晨 0 到 5 点完成专注', icon: '🌍', check: s => s.midnightSession },
    { id: 'rice_can_wait', group: '特别时段', name: '饭可以晚点吃', desc: '午饭时段仍在专注；解锁后请先去吃饭', icon: '🍚', check: s => s.lunchSession },
    { id: 'weekend_warrior', group: '周末专注', name: '周末是什么', desc: '在周末完成 5 次专注', icon: '🛡️', metric: 'weekendSessions', target: 5, unit: '次', check: s => s.weekendSessions >= 5 },
    { id: 'perfect_tomato', group: '标准番茄', name: '标准件出厂', desc: '完成一次正好 25 分钟的标准番茄', icon: '📏', check: s => s.perfectTwentyFive },
    { id: 'review_detective', group: '学习复盘', name: '复盘侦探', desc: '写下 10 条复盘，案发现场逐渐清晰', icon: '🕵️', metric: 'reviewCount', target: 10, unit: '条', check: s => s.reviewCount >= 10 },
    { id: 'subject_octopus', group: '跨类学习', name: '学科八爪鱼', desc: '在 5 个不同分类留下专注记录', icon: '🐙', metric: 'categoryCount', target: 5, unit: '类', check: s => s.categoryCount >= 5 },
    { id: 'brake_technician', group: '科学休息', name: '刹车也是技术', desc: '合理使用一次提前结束，没有硬熬', icon: '🛑', check: s => s.endedEarlyCount >= 1 },
  ];

  const generated = [
    milestoneSeries({ idPrefix: 'session', group: '专注次数', metric: 'totalSessions', icon: '🍅', unit: '次', items: [[2,'梅开二度'],[5,'五颗番茄'],[20,'热身结束'],[75,'渐入佳境'],[150,'专注常客'],[200,'两百回合'],[300,'番茄仓库'],[500,'半千俱乐部'],[800,'八百壮士'],[1000,'千次打卡'],[2000,'两千次不走神'],[5000,'计时器终身会员']] }),
    milestoneSeries({ idPrefix: 'hours', group: '累计时长', metric: 'totalHours', icon: '⏳', unit: '小时', items: [[1,'第一小时'],[3,'三小时定律'],[5,'小有积累'],[20,'二十小时法则'],[50,'半百小时'],[200,'长期主义'],[300,'三百小时'],[750,'时间富翁'],[1500,'千五修炼'],[3000,'三千小时'],[5000,'五千小时'],[10000,'一万小时传说']] }),
    milestoneSeries({ idPrefix: 'streak_more', group: '连续坚持', metric: 'currentStreak', icon: '📆', unit: '天', items: [[2,'两天不是巧合'],[5,'工作日全勤'],[14,'双周连胜'],[21,'习惯成形'],[60,'双月坚持'],[90,'季度全勤'],[100,'百日筑基'],[180,'半年不掉线'],[365,'全年在线'],[1000,'千日传说']] }),
    milestoneSeries({ idPrefix: 'tasks', group: '任务完成', metric: 'completedTasks', icon: '✅', unit: '个', items: [[1,'第一项已完成'],[5,'清单清道夫'],[20,'二十连斩'],[50,'任务搬运工'],[200,'两百件小事'],[300,'待办压缩机'],[500,'任务粉碎机'],[1000,'千项交付'],[2000,'清单无底洞'],[5000,'完成主义者']] }),
    milestoneSeries({ idPrefix: 'reviews', group: '学习复盘', metric: 'reviewCount', icon: '📝', unit: '条', items: [[1,'第一次回头看'],[3,'三省吾身'],[5,'复盘入门'],[20,'证据收集员'],[50,'错因分析师'],[100,'复盘档案馆'],[300,'学习法医'],[1000,'元认知大师']] }),
    milestoneSeries({ idPrefix: 'days', group: '学习天数', metric: 'focusDays', icon: '🗓️', unit: '天', items: [[2,'第二个脚印'],[5,'五日有痕'],[10,'十日留档'],[20,'二十天出现'],[30,'月度出勤'],[50,'五十天见证'],[100,'百日足迹'],[200,'两百天记录'],[365,'全年有迹'],[1000,'千日学习史']] }),
    milestoneSeries({ idPrefix: 'daily', group: '单日纪录', metric: 'maxDaily', icon: '⚡', unit: '分钟', items: [[30,'半小时开机'],[120,'两小时沉浸'],[240,'四小时深潜'],[300,'五小时硬核'],[600,'十小时极限'],[720,'十二小时警报']] }),
    milestoneSeries({ idPrefix: 'longest', group: '单次纪录', metric: 'longestSession', icon: '🎯', unit: '分钟', items: [[15,'十五分钟启动'],[25,'经典番茄'],[45,'一节课长度'],[60,'整点专注'],[90,'长线深潜'],[120,'两小时结界']] }),
    milestoneSeries({ idPrefix: 'categories', group: '跨类学习', metric: 'categoryCount', icon: '🧩', unit: '类', items: [[1,'找到方向'],[2,'左右开弓'],[3,'三线推进'],[4,'四门齐开'],[10,'十项全能']] }),
    milestoneSeries({ idPrefix: 'early_stop', group: '科学休息', metric: 'endedEarlyCount', icon: '🛑', unit: '次', items: [[3,'会踩刹车'],[10,'不和疲劳硬刚'],[30,'节奏管理员'],[100,'休息也是计划']] }),
    milestoneSeries({ idPrefix: 'weekend', group: '周末专注', metric: 'weekendSessions', icon: '🛡️', unit: '次', items: [[1,'周末出勤'],[10,'周末常驻'],[30,'休息日也有节奏'],[100,'周末守望者']] }),
    milestoneSeries({ idPrefix: 'perfect25', group: '标准番茄', metric: 'perfectTwentyFiveCount', icon: '📏', unit: '次', items: [[5,'五个标准件'],[10,'番茄质检员'],[30,'标准化生产线'],[100,'ISO 25 分钟']] }),
    milestoneSeries({ idPrefix: 'habits', group: '每日坚持', metric: 'habitCompletions', icon: '🌱', unit: '次', items: [[1,'第一次打卡'],[7,'习惯发芽'],[30,'打卡月卡'],[100,'习惯变本能'],[365,'全年打卡'],[1000,'坚持无需解释']] }),
  ].flat();

  return Object.freeze([...base, ...generated]);
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AchievementCatalog;
