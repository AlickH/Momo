const path = require('node:path');
const { AppError } = require('./errors');
const { readJson, writeJson, isPlainObject } = require('./util');

const DEFAULTS = Object.freeze({
  mixedPort: 7890,
  allowLan: true,
  mode: 'rule',
  logLevel: 'info',
  ipv6: false,
  unifiedDelay: true,
  tcpConcurrent: true,
  subscriptionUpdateHours: 0,
  dnsPort: 1053,
  dnsNameserver: '',
  tunEnabled: false,
  tunStack: 'gvisor',
  tunAutoRoute: true,
  tunDnsHijack: true,
});

const TUN_STACKS = new Set(['gvisor', 'system', 'mixed']);

const MODES = new Set(['rule', 'global', 'direct']);
const LOG_LEVELS = new Set(['debug', 'info', 'warning', 'error', 'silent']);

function validateSettings(input) {
  if (!isPlainObject(input)) {
    throw new AppError('设置格式无效', { status: 400, code: 'invalid_settings' });
  }
  const errors = [];
  const result = { ...DEFAULTS };

  if (input.mixedPort !== undefined) {
    const port = Number(input.mixedPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      errors.push('代理端口必须是 1024 到 65535 之间的整数');
    } else {
      result.mixedPort = port;
    }
  }
  if (input.allowLan !== undefined) {
    if (typeof input.allowLan !== 'boolean') errors.push('allowLan 必须是布尔值');
    else result.allowLan = input.allowLan;
  }
  if (input.mode !== undefined) {
    if (!MODES.has(input.mode)) errors.push('模式必须是 rule、global 或 direct');
    else result.mode = input.mode;
  }
  if (input.logLevel !== undefined) {
    if (!LOG_LEVELS.has(input.logLevel)) errors.push('日志级别无效');
    else result.logLevel = input.logLevel;
  }
  for (const key of ['ipv6', 'unifiedDelay', 'tcpConcurrent']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') errors.push(`${key} 必须是布尔值`);
      else result[key] = input[key];
    }
  }
  if (input.subscriptionUpdateHours !== undefined) {
    const hours = Number(input.subscriptionUpdateHours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) errors.push('订阅更新间隔必须在 0 到 168 小时之间');
    else result.subscriptionUpdateHours = hours;
  }
  if (input.dnsPort !== undefined) {
    const port = Number(input.dnsPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) errors.push('DNS 端口必须是 1024 到 65535 之间的整数');
    else result.dnsPort = port;
  }
  if (input.tunEnabled !== undefined) {
    if (typeof input.tunEnabled !== 'boolean') errors.push('tunEnabled 必须是布尔值');
    else result.tunEnabled = input.tunEnabled;
  }
  if (input.tunStack !== undefined) {
    if (!TUN_STACKS.has(input.tunStack)) errors.push('TUN 栈必须是 gvisor、system 或 mixed');
    else result.tunStack = input.tunStack;
  }
  for (const key of ['tunAutoRoute', 'tunDnsHijack']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') errors.push(`${key} 必须是布尔值`);
      else result[key] = input[key];
    }
  }
  if (input.dnsNameserver !== undefined) {
    if (typeof input.dnsNameserver !== 'string') errors.push('DNS 服务器必须是字符串');
    else {
      const nameserver = input.dnsNameserver.trim();
      if (nameserver.length > 1024) errors.push('DNS 服务器列表过长');
      else result.dnsNameserver = nameserver;
    }
  }

  if (errors.length) {
    throw new AppError(errors[0], { status: 400, code: 'invalid_settings', details: errors });
  }
  return result;
}

class SettingsStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'settings.json');
    this.value = { ...DEFAULTS };
  }

  async load() {
    const stored = await readJson(this.file, null);
    this.value = stored ? validateSettings({ ...DEFAULTS, ...stored }) : { ...DEFAULTS };
    return this.value;
  }

  get() {
    return { ...this.value };
  }

  async update(patch) {
    const merged = validateSettings({ ...this.value, ...patch });
    await this.save(merged);
    this.value = merged;
    return this.get();
  }

  async save(next) {
    await writeJson(this.file, next, 0o600);
  }
}

module.exports = { SettingsStore, DEFAULTS, MODES, LOG_LEVELS, validateSettings };
