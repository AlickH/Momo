const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('../src/logger');
const { MomoService } = require('../src/service');
const { createApp } = require('../src/app');
const { resolveEnv } = require('../src/env');

async function startApp(allowNoAuth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-api-'));
  const env = resolveEnv({
    appDir: path.resolve(__dirname, '..'),
    dataDir: dir,
    webDir: path.resolve(__dirname, '..', '..', 'frontend', 'dist'),
    allowNoAuth,
    dev: allowNoAuth,
    gatewayPrefix: '/app/momo',
    coreBin: '/nonexistent',
    geoSourceDir: path.resolve(__dirname, '..', '..', 'vendor'),
  });
  const logger = new Logger(path.join(dir, 'logs'));
  await logger.init();
  const service = new MomoService({ env, logger });
  await service.init();
  const app = createApp({ env, service, logger });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}/app/momo`, logger, service, dir };
}

test('API requires admin gateway headers when auth is enforced', async () => {
  const { server, base } = await startApp(false);
  try {
    let response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 401);

    response = await fetch(`${base}/api/status`, { headers: { 'X-Trim-Userid': '1000', 'X-Trim-Isadmin': 'false' } });
    assert.equal(response.status, 403);

    response = await fetch(`${base}/api/status`, { headers: { 'X-Trim-Userid': '1000', 'X-Trim-Isadmin': 'true' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.core.state, 'stopped');

    response = await fetch(`${base}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Trim-Userid': '1000', 'X-Trim-Isadmin': 'true' },
      body: JSON.stringify({ logLevel: 'warning' }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Local development mode accepts requests without headers and requires CSRF marker', async () => {
  const { server, base } = await startApp(true);
  try {
    let response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 200);

    response = await fetch(`${base}/api/logs/clear`, { method: 'POST' });
    assert.equal(response.status, 403);

    response = await fetch(`${base}/api/logs/clear`, { method: 'POST', headers: { 'X-Momo-Request': '1' } });
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
