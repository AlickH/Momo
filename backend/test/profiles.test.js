const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileManager, parseUserInfo } = require('../src/profiles');

const YAML = `
proxies:
  - {name: a, type: ss, server: example.com, port: 1, cipher: aes-128-gcm, password: x}
rules:
  - MATCH,DIRECT
`;

test('parseUserInfo parses subscription headers', () => {
  assert.deepEqual(parseUserInfo('upload=1; download=2; total=3; expire=4'), {
    upload: 1, download: 2, total: 3, expire: 4,
  });
  assert.equal(parseUserInfo(''), null);
});

test('ProfileManager stores, activates and removes local profiles', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-profiles-'));
  const logger = { info() {}, warn() {}, error() {} };
  const manager = new ProfileManager({ dataDir: dir, logger });
  await manager.init();
  const profile = await manager.addFromContent({ name: 'Test', content: YAML });
  assert.equal(profile.name, 'Test');
  assert.equal(profile.active, false);
  assert.equal((await manager.readContent(profile.id)).includes('proxies:'), true);
  await manager.setActive(profile.id);
  assert.equal(manager.list()[0].active, true);
  assert.equal((await manager.active())?.id, profile.id);
  await manager.rename(profile.id, 'Renamed');
  assert.equal(manager.list()[0].name, 'Renamed');
  await manager.remove(profile.id);
  assert.equal(manager.list().length, 0);
  assert.equal(manager.activeId, null);
});
