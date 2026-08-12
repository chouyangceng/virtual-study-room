#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const { createArchiveServer, DEFAULT_PORT } = require('./archive-server');

function defaultDataDirectory() {
  return path.join(os.homedir(), 'Documents', '虚拟自习室数据');
}

async function startWindowsArchive(options) {
  const config = options || {};
  const service = await createArchiveServer({
    port: Number(config.port || process.env.VSR_ARCHIVE_PORT || DEFAULT_PORT),
    host: config.host || process.env.VSR_ARCHIVE_HOST || '0.0.0.0',
    dataDirectory: config.dataDirectory || process.env.VSR_ARCHIVE_DATA_DIR || defaultDataDirectory(),
    staticRoot: config.staticRoot || path.join(__dirname, '..')
  });
  const address = await service.listen();
  return Object.assign(service, { address });
}

if (require.main === module) {
  startWindowsArchive().then(service => {
    console.log(`虚拟自习室归档服务已启动：http://localhost:${service.address.port}`);
    console.log(`数据目录：${service.dataDirectory}`);
    console.log('同步 token 仅可在本机打开 /api/v1/local-config 查看。');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { startWindowsArchive, defaultDataDirectory };
