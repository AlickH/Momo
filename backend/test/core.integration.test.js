const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { CoreManager } = require('../src/core');
const { buildRuntimeConfig } = require('../src/config-builder');
const { findFreePort } = require('../src/util');

function coreBinary() {
  const root = path.resolve(__dirname, '..', '..', 'vendor');
  if (process.platform === 'darwin' && process.arch === 'arm64') return path.join(root, 'mihomo-darwin-arm64-v1.19.34');
  if (process.platform === 'linux' && process.arch === 'x64') return path.join(root, 'mihomo-linux-amd64-compatible-v1.19.34');
  if (process.platform === 'linux' && process.arch === 'arm64') return path.join(root, 'mihomo-linux-arm64-v1.19.34');
  return null;
}

test('CoreManager starts a real mihomo process and exposes the controller', { timeout: 45000 }, async (t) => {
  const bin = coreBinary();
  if (!bin || !fs.existsSync(bin)) {
    t.skip('mihomo binary for this platform is not available');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-core-'));
  const coreDir = path.join(dir, 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  const events = [];
  const logger = {
    info() {}, warn() {}, error() {}, coreLine() {},
  };
  let controllerPort;
  const manager = new CoreManager({
    bin,
    dataDir: coreDir,
    logger,
    async prepareConfig({ controllerPort: port, secret }) {
      controllerPort = port;
      const mixedPort = await findFreePort();
      const yaml = buildRuntimeConfig(
        YAML.parse('proxies: []\nproxy-groups:\n  - {name: Proxy, type: select, proxies: [DIRECT]}\nrules:\n  - MATCH,Proxy\n'),
        { mixedPort, allowLan: false, mode: 'rule', logLevel: 'warning', ipv6: false, unifiedDelay: true, tcpConcurrent: true },
        { controllerPort: port, secret },
      );
      const file = path.join(dir, 'config.yaml');
      fs.writeFileSync(file, yaml, { mode: 0o600 });
      return file;
    },
  });
  manager.on('state', (state) => events.push(state.state));
  try {
    await manager.start();
    assert.equal(manager.state, 'running');
    assert.ok(manager.version && manager.version.startsWith('v'));
    const configs = await manager.controller.configs();
    assert.equal(configs.mode, 'rule');
    assert.ok(controllerPort > 0);
    assert.ok(events.includes('starting'));
    assert.ok(events.includes('running'));
  } finally {
    await manager.stop();
  }
  assert.equal(manager.state, 'stopped');
  assert.ok(events.includes('stopped'));
});
