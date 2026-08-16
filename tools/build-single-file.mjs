#!/usr/bin/env node
/* Builds 虚拟自习室.html from index.html by inlining css/style.css and all js/*.js */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexPath = path.join(root, 'index.html');
const outPath = path.join(root, '虚拟自习室.html');

let html = fs.readFileSync(indexPath, 'utf8');

const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/style\.css(?:\?[^\"]*)?">/, () => `<style>\n${css}\n</style>`);

const inline = (src) => {
  const file = path.join(root, src.replace(/[?#].*$/, ''));
  const code = fs.readFileSync(file, 'utf8');
  return `<script>\n${code}\n</script>`;
};

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => inline(src));

html = html.replace(/^[\t ]+$/gm, '');

fs.writeFileSync(outPath, html);
console.log(`written ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
