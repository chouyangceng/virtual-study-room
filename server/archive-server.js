'use strict';

const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { ArchiveStore } = require('./archive-store');

const DEFAULT_PORT = 43110;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

function isLoopback(address) {
  const value = String(address || '').toLowerCase();
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function sendJson(response, statusCode, value, extraHeaders) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extraHeaders));
  response.end(body);
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return null;
  if (origin === 'null') return 'null';
  try {
    const parsed = new URL(origin);
    if (parsed.host === request.headers.host && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return origin;
  } catch (error) { /* reject invalid origin */ }
  return null;
}

function corsHeaders(request) {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function authorized(request, token) {
  const header = String(request.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(String(token || ''));
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    request.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes && !rejected) {
        rejected = true;
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    request.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    request.on('error', reject);
  });
}

function serviceUrls(port) {
  const urls = [`http://localhost:${port}`];
  const interfaces = os.networkInterfaces();
  Object.values(interfaces).flat().forEach(address => {
    if (!address || address.internal || address.family !== 'IPv4') return;
    urls.push(`http://${address.address}:${port}`);
  });
  return Array.from(new Set(urls));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
  }[extension] || 'application/octet-stream';
}

function staticSecurityHeaders(filePath) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY'
  };
  if (path.extname(filePath).toLowerCase() === '.html') {
    headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://images.unsplash.com data: blob:; connect-src 'self' http: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'";
  }
  return headers;
}

function hasTraversalAttempt(rawUrl) {
  let value = String(rawUrl || '').split('?')[0];
  for (let index = 0; index < 3; index += 1) {
    try { value = decodeURIComponent(value); } catch (error) { break; }
  }
  return value.includes('\0') || value.split(/[\\/]+/).includes('..');
}

function isAllowedStaticPath(relative) {
  const normalized = relative.replace(/\\/g, '/');
  if (['index.html', 'manifest.webmanifest', 'sw.js'].includes(normalized)) return true;
  return /^(?:css|js|shared|icons|vendor)\/[a-zA-Z0-9._/?=&%-]+$/.test(normalized);
}

async function serveStatic(request, response, staticRoot, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (error) { sendJson(response, 400, { error: '路径编码无效' }); return; }
  if (decoded.includes('\0') || decoded.split(/[\\/]+/).includes('..')) {
    sendJson(response, 403, { error: '禁止路径穿越' });
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
  if (!isAllowedStaticPath(relative)) {
    sendJson(response, 404, { error: '未找到资源' });
    return;
  }
  const root = path.resolve(staticRoot);
  const filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 403, { error: '禁止路径穿越' });
    return;
  }
  let stat;
  try { stat = await fs.promises.stat(filePath); } catch (error) { sendJson(response, 404, { error: '未找到资源' }); return; }
  if (!stat.isFile()) { sendJson(response, 404, { error: '未找到资源' }); return; }
  response.writeHead(200, Object.assign({
    'Content-Type': contentType(filePath),
    'Content-Length': stat.size
  }, staticSecurityHeaders(filePath)));
  if (request.method === 'HEAD') { response.end(); return; }
  fs.createReadStream(filePath).pipe(response);
}

async function createArchiveServer(options) {
  const config = options || {};
  const staticRoot = path.resolve(config.staticRoot || path.join(__dirname, '..'));
  const dataDirectory = path.resolve(config.dataDirectory);
  const port = Number(config.port ?? DEFAULT_PORT);
  const host = config.host || '0.0.0.0';
  const maxBodyBytes = Number(config.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
  const remoteAddressResolver = config.remoteAddressResolver || (request => request.socket.remoteAddress);
  const store = new ArchiveStore(dataDirectory);
  await store.init();
  let boundPort = port;

  const server = http.createServer(async (request, response) => {
    const cors = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin(request)) { sendJson(response, 403, { error: 'Origin 不允许' }); return; }
      response.writeHead(204, cors);
      response.end();
      return;
    }
    if (hasTraversalAttempt(request.url)) { sendJson(response, 403, { error: '禁止路径穿越' }); return; }
    let url;
    try { url = new URL(request.url, `http://${request.headers.host || 'localhost'}`); } catch (error) { sendJson(response, 400, { error: 'URL 无效' }); return; }
    const pathname = url.pathname;
    try {
      if (pathname === '/api/v1/health' && request.method === 'GET') {
        sendJson(response, 200, { ok: true, service: 'virtual-study-room-archive', apiVersion: 1 }, cors);
        return;
      }
      if (pathname === '/api/v1/local-config' && request.method === 'GET') {
        if (!isLoopback(remoteAddressResolver(request))) { sendJson(response, 403, { error: '仅允许本机回环访问' }, cors); return; }
        // Never grant cross-origin read access to the endpoint that reveals the bearer token.
        // The Windows UI is same-origin and does not need CORS for this request.
        sendJson(response, 200, { port: boundPort, dataDirectory, token: store.token, serviceUrls: serviceUrls(boundPort) });
        return;
      }
      if (pathname.startsWith('/api/v1/')) {
        if (!authorized(request, store.token)) { sendJson(response, 401, { error: '未授权' }, Object.assign({ 'WWW-Authenticate': 'Bearer' }, cors)); return; }
        if (pathname === '/api/v1/snapshots' && request.method === 'POST') {
          const rawBody = await readBody(request, maxBodyBytes);
          let snapshot;
          try { snapshot = JSON.parse(rawBody.toString('utf8')); } catch (error) { sendJson(response, 400, { error: 'JSON 无效' }, cors); return; }
          const receipt = await store.saveSnapshot(rawBody, snapshot);
          sendJson(response, 201, { receipt }, cors);
          return;
        }
        if (pathname === '/api/v1/snapshots' && request.method === 'GET') {
          sendJson(response, 200, { snapshots: await store.listSnapshots() }, cors);
          return;
        }
        const match = pathname.match(/^\/api\/v1\/snapshots\/([^/]+)\/([^/]+)$/);
        if (match && request.method === 'GET') {
          const found = await store.readSnapshot(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
          if (!found) { sendJson(response, 404, { error: '归档不存在' }, cors); return; }
          response.writeHead(200, Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': found.body.length,
            'Cache-Control': 'no-store',
            'X-Archive-SHA256': found.receipt.sha256,
            'X-Content-Type-Options': 'nosniff'
          }, cors));
          response.end(found.body);
          return;
        }
        sendJson(response, 404, { error: 'API 不存在' }, cors);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') { sendJson(response, 405, { error: '方法不允许' }); return; }
      await serveStatic(request, response, staticRoot, pathname);
    } catch (error) {
      if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message || '服务错误' }, cors);
      else response.destroy();
    }
  });

  return {
    server, store, host, dataDirectory,
    get port() { return boundPort; },
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          boundPort = server.address().port;
          resolve(server.address());
        });
      });
    },
    close() { return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  };
}

module.exports = { createArchiveServer, isLoopback, serviceUrls, hasTraversalAttempt, isAllowedStaticPath, staticSecurityHeaders, DEFAULT_PORT, DEFAULT_MAX_BODY_BYTES };
