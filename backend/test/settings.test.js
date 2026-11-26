const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSettings } = require('../src/settings');

test('validateSettings applies defaults and rejects invalid values', () => {
  assert.deepEqual(validateSettings({}), {
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
  });
  assert.equal(validateSettings({ mixedPort: 1080 }).mixedPort, 1080);
  assert.throws(() => validateSettings({ mixedPort: 80 }), /端口/);
  assert.throws(() => validateSettings({ mode: 'turbo' }), /模式/);
  assert.throws(() => validateSettings({ logLevel: 'verbose' }), /日志级别/);
  assert.throws(() => validateSettings({ allowLan: 'yes' }), /allowLan/);
  assert.equal(validateSettings({ subscriptionUpdateHours: 12 }).subscriptionUpdateHours, 12);
  assert.throws(() => validateSettings({ dnsPort: 53 }), /DNS 端口/);
  assert.equal(validateSettings({ dnsNameserver: 'https://doh.pub/dns-query' }).dnsNameserver, 'https://doh.pub/dns-query');
  assert.equal(validateSettings({ proxyMode: 'tun', tunStack: 'system' }).tunStack, 'system');
  assert.equal(validateSettings({ proxyMode: 'redir', redirPort: 7893 }).redirPort, 7893);
  assert.throws(() => validateSettings({ proxyMode: 'nope' }), /透明代理/);
  assert.throws(() => validateSettings({ tunStack: 'nope' }), /TUN 栈/);
  assert.throws(() => validateSettings({ redirPort: 53 }), /Redir 端口/);
});
