const test = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { parseProfile, buildRuntimeConfig, decodeBase64Yaml } = require('../src/config-builder');

const SAMPLE = `
proxies:
  - name: node-a
    type: ss
    server: example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
proxy-groups:
  - name: Proxy
    type: select
    proxies: [node-a, DIRECT]
rules:
  - DOMAIN-SUFFIX,example.com,Proxy
  - MATCH,DIRECT
`;

const SETTINGS = {
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
  tunStack: 'gvisor',
  tunAutoRoute: true,
  tunDnsHijack: true,
};

test('parseProfile accepts a Clash style profile', () => {
  const parsed = parseProfile(SAMPLE);
  assert.equal(parsed.proxyCount, 1);
  assert.equal(parsed.providerCount, 0);
  assert.equal(parsed.config.proxies[0].name, 'node-a');
});

test('parseProfile decodes base64 subscriptions', () => {
  const encoded = Buffer.from(SAMPLE, 'utf8').toString('base64');
  const parsed = parseProfile(encoded);
  assert.equal(parsed.proxyCount, 1);
  assert.match(parsed.content, /proxies:/);
  assert.equal(decodeBase64Yaml(encoded)?.includes('proxies:'), true);
});

test('parseProfile rejects empty and malformed configs', () => {
  assert.throws(() => parseProfile(''), /配置内容为空/);
  assert.throws(() => parseProfile('{'), /YAML 解析失败/);
  assert.throws(() => parseProfile('foo: bar'), /没有 proxies/);
});

test('buildRuntimeConfig overrides runtime fields and strips controller UI', () => {
  const base = YAML.parse(SAMPLE);
  base['external-controller'] = '0.0.0.0:9090';
  base['external-ui'] = './ui';
  const text = buildRuntimeConfig(base, SETTINGS, { controllerPort: 19090, secret: 'top-secret' });
  const config = YAML.parse(text);
  assert.equal(config['mixed-port'], 7890);
  assert.equal(config['external-controller'], '127.0.0.1:19090');
  assert.equal(config.secret, 'top-secret');
  assert.equal(config.port, 0);
  assert.equal(config['socks-port'], 0);
  assert.equal(config['external-ui'], undefined);
  assert.equal(config['allow-lan'], true);
  assert.equal(config.profile['store-selected'], true);
  assert.deepEqual(config.rules, base.rules);
});

test('buildRuntimeConfig applies configured DNS listen and nameservers', () => {
  const base = YAML.parse(SAMPLE);
  base.dns = { enable: true, listen: '0.0.0.0:53', 'enhanced-mode': 'fake-ip' };
  const config = YAML.parse(buildRuntimeConfig(base, { ...SETTINGS, dnsPort: 1053, dnsNameserver: 'https://doh.pub/dns-query, 223.5.5.5' }, { controllerPort: 19090, secret: 'x' }));
  assert.equal(config.dns.listen, '0.0.0.0:1053');
  assert.deepEqual(config.dns.nameserver, ['https://doh.pub/dns-query', '223.5.5.5']);
});

test('buildRuntimeConfig enables and disables TUN/Redir from app settings', () => {
  const enabled = YAML.parse(buildRuntimeConfig(null, { ...SETTINGS, proxyMode: 'tun', tunStack: 'system' }, { controllerPort: 19090, secret: 'x' }));
  assert.equal(enabled.tun.enable, true);
  assert.equal(enabled.tun.stack, 'system');
  assert.deepEqual(enabled.tun['dns-hijack'], ['any:53']);
  assert.equal(enabled['redir-port'], 0);

  const redir = YAML.parse(buildRuntimeConfig(null, { ...SETTINGS, proxyMode: 'redir', redirPort: 7892 }, { controllerPort: 19090, secret: 'x' }));
  assert.equal(redir.tun, undefined);
  assert.equal(redir['redir-port'], 7892);

  const disabled = YAML.parse(buildRuntimeConfig({ tun: { enable: true, stack: 'gvisor' } }, SETTINGS, { controllerPort: 19090, secret: 'x' }));
  assert.equal(disabled.tun.enable, false);
  assert.equal(disabled['redir-port'], 0);
});

test('buildRuntimeConfig supplies a minimal direct config when no profile exists', () => {
  const text = buildRuntimeConfig(null, { ...SETTINGS, mode: 'global', logLevel: 'warning' }, { controllerPort: 12345, secret: 'x' });
  const config = YAML.parse(text);
  assert.equal(config.mode, 'global');
  assert.equal(config['log-level'], 'warning');
  assert.deepEqual(config.proxies, []);
  assert.deepEqual(config['proxy-groups'], []);
  assert.deepEqual(config.rules, ['MATCH,DIRECT']);
});
