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

function parseCustomRules(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function buildRuntimeConfig(profile, settings, { controllerPort, secret, controllerHost = '127.0.0.1' }) {
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
    'external-controller': `${controllerHost}:${controllerPort}`,
    secret,
    'geo-auto-update': false,
    profile: {
      ...(isPlainObject(base.profile) ? base.profile : {}),
      'store-selected': true,
      'store-fake-ip': true,
    },
  });

  const customRules = parseCustomRules(settings.customRules);
  if (customRules.length) {
    config.rules = [...customRules, ...(Array.isArray(config.rules) ? config.rules : [])];
  }

  const proxyMode = settings.proxyMode || (settings.tunEnabled ? 'tun' : 'off');
  if (isPlainObject(config.tun) || proxyMode === 'tun') {
    config.tun = {
      ...(isPlainObject(config.tun) ? config.tun : {}),
      enable: proxyMode === 'tun',
      ...(proxyMode === 'tun' ? {
        stack: settings.tunStack,
        device: 'momo0',
        'auto-route': settings.tunAutoRoute,
        'auto-detect-interface': settings.tunAutoRoute,
        'dns-hijack': settings.tunDnsHijack ? ['any:53'] : [],
      } : {}),
    };
  }
  config['redir-port'] = proxyMode === 'redir' ? settings.redirPort : 0;
  config['tproxy-port'] = 0;

  if (isPlainObject(config.dns)) {
    const dns = { ...config.dns, listen: `0.0.0.0:${settings.dnsPort}` };
    if (settings.dnsNameserver) {
      const nameserver = settings.dnsNameserver.split(/[\s,]+/).filter(Boolean);
      if (nameserver.length) dns.nameserver = nameserver;
    }
    config.dns = dns;
  }

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

module.exports = {
  parseProfile,
  buildRuntimeConfig,
  decodeBase64Yaml,
};
