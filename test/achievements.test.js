'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const achievements = require('../js/achievements');

test('achievement catalog contains exactly 200 new playful achievements', () => {
  assert.equal(achievements.length, 326);
  assert.equal(new Set(achievements.map(item => item.id)).size, achievements.length);
  achievements.forEach(item => {
    assert.match(item.id, /^[a-z0-9_]+$/);
    assert.ok(item.name && item.desc && item.icon && item.group);
    assert.equal(typeof item.check, 'function');
  });
  const playful = achievements.filter(item => item.id.startsWith('fun_'));
  assert.equal(playful.length, 200);
  assert.equal(new Set(playful.map(item => item.name)).size, 200);
  assert.ok(playful.every(item => item.desc.length >= 12));
  const playableMetrics = new Set([
    'totalSessions', 'totalHours', 'focusDays', 'currentStreak',
    'completedTasks', 'habitCompletions', 'reviewCount',
    'perfectTwentyFiveCount', 'weekendSessions', 'earlyBirdCount',
    'nightOwlCount', 'morningSessions', 'afternoonSessions',
    'eveningSessions', 'shortSessions', 'longSessions', 'notedSessions',
    'taskLinkedSessions', 'activeWeeks', 'productiveDays'
  ]);
  assert.ok(playful.every(item => playableMetrics.has(item.metric)));
});

test('numeric milestones unlock at their target and remain locked below it', () => {
  achievements.filter(item => item.metric && item.target).forEach(item => {
    assert.equal(item.check({ [item.metric]: item.target }), true, item.id);
    assert.equal(item.check({ [item.metric]: Math.max(0, item.target - 1) }), false, item.id);
  });
});
