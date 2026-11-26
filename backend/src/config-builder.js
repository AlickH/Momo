const { spawn } = require('node:child_process');
const YAML = require('yaml');
const { AppError, badRequest } = require('./errors');
const { isPlainObject } = require('./util');

function tryParseYaml(text) {
  try {
    return { ok: true, value: YAML.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function decodeBase64Yaml(text) {
  const compact = String(text).replace(/\s+/g, '');
  if (compact.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(compact)) return null;
  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8');
    if (!/proxies\s*:|proxy-groups\s*:|proxy-providers\s*:/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseProfile(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw badRequest('配置内容为空');
  }
  let parsed = tryParseYaml(content);
  let finalContent = content;
  if (parsed.ok && typeof parsed.value === 'string') {
    const decoded = decodeBase64Yaml(parsed.value);
    if (decoded) {
      finalContent = decoded;
      parsed = tryParseYaml(decoded);
    }
  }
  if (!parsed.ok) {
    throw badRequest(`YAML 解析失败：${parsed.error.message.split('\n')[0]}`);
  }
  if (!isPlainObject(parsed.value)) {
    throw badRequest('配置必须是 YAML 对象');
  }
  const config = parsed.value;
  if (config.proxies !== undefined && !Array.isArray(config.proxies)) {
    throw badRequest('proxies 必须是数组');
  }
  if (config['proxy-groups'] !== undefined && !Array.isArray(config['proxy-groups'])) {
    throw badRequest('proxy-groups 必须是数组');
  }
  if (config.rules !== undefined && !Array.isArray(config.rules)) {
    throw badRequest('rules 必须是数组');
  }
  if (config['proxy-providers'] !== undefined && !isPlainObject(config['proxy-providers'])) {
    throw badRequest('proxy-providers 必须是对象');
  }
  const proxyCount = Array.isArray(config.proxies) ? config.proxies.length : 0;
  const providerCount = isPlainObject(config['proxy-providers'])
    ? Object.keys(config['proxy-providers']).length
    : 0;
  if (proxyCount === 0 && providerCount === 0 && !Array.isArray(config['proxy-groups'])) {
    throw badRequest('配置中没有 proxies 或 proxy-providers');
  }
  return { config, content: finalContent, proxyCount, providerCount };
}

function buildRuntimeConfig(profile, settings, { controllerPort, secret }) {
  const base = profile ? structuredClone(profile) : {};
  const config = { ...base };

  delete config['external-ui'];
  delete config['external-ui-name'];
  delete config['external-ui-url'];
  delete config['external-controller-unix'];
  delete config['external-controller-pipe'];
  delete config['external-controller-tls'];

  Object.assign(config, {
    'mixed-port': settings.mixedPort,
    port: 0,
    'socks-port': 0,
    'redir-port': 0,
    'tproxy-port': 0,
    'allow-lan': settings.allowLan,
    'bind-address': '*',
    mode: settings.mode,
    'log-level': settings.logLevel,
    ipv6: settings.ipv6,
    'unified-delay': settings.unifiedDelay,
    'tcp-concurrent': settings.tcpConcurrent,
    'external-controller': `127.0.0.1:${controllerPort}`,
    secret,
    'geo-auto-update': false,
    profile: {
      ...(isPlainObject(base.profile) ? base.profile : {}),
      'store-selected': true,
      'store-fake-ip': true,
    },
  });

  if (!Array.isArray(config.rules) || config.rules.length === 0) {
    config.rules = ['MATCH,DIRECT'];
  }
  if (config.proxies === undefined) config.proxies = [];
  if (config['proxy-groups'] === undefined) config['proxy-groups'] = [];

  return YAML.stringify(config, {
    lineWidth: 0,
    aliasDuplicateObjects: false,
    sortMapEntries: false,
  });
}

function validateMihomoConfig({ bin, configPath, dataDir, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-t', '-d', dataDir, '-f', configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let output = '';
    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > 20000) output = output.slice(-20000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('配置校验超时', { status: 400, code: 'config_timeout', details: output }));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new AppError(`无法运行 mihomo：${error.message}`, { status: 500, code: 'core_missing' }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(output);
      } else {
        const lines = output
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-8)
          .join('\n');
        reject(new AppError(`mihomo 拒绝了该配置${lines ? `：\n${lines}` : ''}`, {
          status: 400,
          code: 'invalid_config',
          details: output,
        }));
      }
    });
  });
}

module.exports = {
  parseProfile,
  buildRuntimeConfig,
  validateMihomoConfig,
  decodeBase64Yaml,
};
