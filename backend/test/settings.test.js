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
  });
  assert.equal(validateSettings({ mixedPort: 1080 }).mixedPort, 1080);
  assert.throws(() => validateSettings({ mixedPort: 80 }), /端口/);
  assert.throws(() => validateSettings({ mode: 'turbo' }), /模式/);
  assert.throws(() => validateSettings({ logLevel: 'verbose' }), /日志级别/);
  assert.throws(() => validateSettings({ allowLan: 'yes' }), /allowLan/);
});
