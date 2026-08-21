'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const achievements = require('../js/achievements');

test('achievement catalog contains roughly one hundred unique, valid entries', () => {
  assert.ok(achievements.length >= 100 && achievements.length <= 160, `unexpected achievement count: ${achievements.length}`);
  assert.equal(new Set(achievements.map(item => item.id)).size, achievements.length);
  achievements.forEach(item => {
    assert.match(item.id, /^[a-z0-9_]+$/);
    assert.ok(item.name && item.desc && item.icon && item.group);
    assert.equal(typeof item.check, 'function');
  });
});

test('numeric milestones unlock at their target and remain locked below it', () => {
  achievements.filter(item => item.metric && item.target).forEach(item => {
    assert.equal(item.check({ [item.metric]: item.target }), true, item.id);
    assert.equal(item.check({ [item.metric]: Math.max(0, item.target - 1) }), false, item.id);
  });
});
