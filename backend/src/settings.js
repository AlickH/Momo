const path = require('node:path');
const crypto = require('node:crypto');
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
  proxyMode: 'off',
  redirPort: 7892,
  testUrl: 'http://www.gstatic.com/generate_204',
  testTimeout: 5000,
  tunStack: 'gvisor',
  tunAutoRoute: true,
  tunDnsHijack: true,
  externalController: false,
  externalControllerPort: 9090,
  externalControllerSecret: '',
  telegramEnabled: false,
  telegramToken: '',
  telegramChatId: '',
  telegramNotify: true,
});

const TUN_STACKS = new Set(['gvisor', 'system', 'mixed']);
const PROXY_MODES = new Set(['off', 'tun', 'redir']);

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
  if (input.proxyMode !== undefined) {
    if (!PROXY_MODES.has(input.proxyMode)) errors.push('透明代理模式无效');
    else result.proxyMode = input.proxyMode;
  }
  if (input.testUrl !== undefined) {
    if (typeof input.testUrl !== 'string' || !/^https?:\/\//i.test(input.testUrl.trim())) {
      errors.push('测速地址必须是 HTTP 或 HTTPS URL');
    } else {
      result.testUrl = input.testUrl.trim();
    }
  }
  if (input.testTimeout !== undefined) {
    const timeout = Number(input.testTimeout);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 10000) errors.push('测速超时必须在 1000 到 10000 毫秒之间');
    else result.testTimeout = timeout;
  }
  if (input.redirPort !== undefined) {
    const port = Number(input.redirPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) errors.push('Redir 端口必须是 1024 到 65535 之间的整数');
    else result.redirPort = port;
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
  if (input.telegramEnabled !== undefined) {
    if (typeof input.telegramEnabled !== 'boolean') errors.push('telegramEnabled 必须是布尔值');
    else result.telegramEnabled = input.telegramEnabled;
  }
  if (input.telegramNotify !== undefined) {
    if (typeof input.telegramNotify !== 'boolean') errors.push('telegramNotify 必须是布尔值');
    else result.telegramNotify = input.telegramNotify;
  }
  if (input.telegramToken !== undefined) {
    if (typeof input.telegramToken !== 'string' || input.telegramToken.trim().length > 200) errors.push('Telegram Token 无效');
    else result.telegramToken = input.telegramToken.trim();
  }
  if (input.telegramChatId !== undefined) {
    if (typeof input.telegramChatId !== 'string' || input.telegramChatId.trim().length > 64) errors.push('Telegram Chat ID 无效');
    else result.telegramChatId = input.telegramChatId.trim();
  }
  if (input.externalController !== undefined) {
    if (typeof input.externalController !== 'boolean') errors.push('externalController 必须是布尔值');
    else result.externalController = input.externalController;
  }
  if (input.externalControllerPort !== undefined) {
    const port = Number(input.externalControllerPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) errors.push('外部控制器端口必须是 1024 到 65535 之间的整数');
    else result.externalControllerPort = port;
  }
  if (input.externalControllerSecret !== undefined) {
    if (typeof input.externalControllerSecret !== 'string') errors.push('外部控制器密钥必须是字符串');
    else {
      const secret = input.externalControllerSecret.trim();
      if (secret.length > 0 && (secret.length < 16 || secret.length > 128)) errors.push('外部控制器密钥长度必须在 16 到 128 之间');
      else result.externalControllerSecret = secret;
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
    if (!stored) {
      this.value = { ...DEFAULTS };
      return this.value;
    }
    const merged = { ...DEFAULTS, ...stored };
    if (stored.proxyMode === undefined && stored.tunEnabled === true) merged.proxyMode = 'tun';
    this.value = validateSettings(merged);
    return this.value;
  }

  get() {
    return { ...this.value };
  }

  async update(patch) {
    const next = { ...this.value, ...patch };
    if (next.externalController && !next.externalControllerSecret) {
      next.externalControllerSecret = crypto.randomBytes(24).toString('hex');
    }
    const merged = validateSettings(next);
    await this.save(merged);
    this.value = merged;
    return this.get();
  }

  async save(next) {
    await writeJson(this.file, next, 0o600);
  }
}

module.exports = { SettingsStore, DEFAULTS, MODES, LOG_LEVELS, validateSettings };
