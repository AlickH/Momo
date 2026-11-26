const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFileAtomic(file, data, mode) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, data);
  if (mode !== undefined) await fs.chmod(tmp, mode);
  await fs.rename(tmp, file);
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value, mode) {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, mode);
}

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function cleanName(value, max = 60) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function safePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = {
  sleep,
  ensureDir,
  writeFileAtomic,
  readJson,
  writeJson,
  findFreePort,
  randomSecret,
  cleanName,
  isPlainObject,
  parseBoolean,
  clamp,
  formatBytes,
  safePathSegment,
};
