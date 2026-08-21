'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

test('desktop packaging icons exist in the repository', () => {
  const pkg = require('../package.json');
  assert.equal(exists(pkg.build.win.icon), true, `missing Windows icon: ${pkg.build.win.icon}`);
  assert.equal(exists(pkg.build.mac.icon), true, `missing macOS icon: ${pkg.build.mac.icon}`);
  assert.equal(exists('icons/app-icon-v2.ico'), true, 'missing Electron Windows window icon');
  assert.equal(exists('icons/icon-512.png'), true, 'missing Electron macOS window icon');
  assert.equal(pkg.build.files.includes('vendor/**/*'), true, 'desktop package must include local Chart.js/XLSX vendors');
});

test('manifest and local HTML resources exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons || []) {
    assert.equal(exists(icon.src), true, `missing manifest icon: ${icon.src}`);
  }

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1].split('?')[0])
    .filter(value => value && !/^(?:https?:|data:|#)/.test(value));
  for (const reference of new Set(references)) {
    assert.equal(exists(reference), true, `missing HTML resource: ${reference}`);
  }
});
