const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('../src/logger');

test('Logger parses mihomo lines and keeps a bounded tail', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-log-'));
  const logger = new Logger(dir);
  await logger.init();
  logger.coreLine('time="2026-01-01T00:00:00Z" level=info msg="Start initial configuration in progress"');
  logger.coreLine('time="2026-01-01T00:00:01Z" level=warning msg="Mihomo shutting down"');
  const entries = logger.list({ since: 0, limit: 10 });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, 'info');
  assert.equal(entries[0].message, 'Start initial configuration in progress');
  assert.equal(entries[1].level, 'warning');
  assert.equal(logger.latestId(), 2);
  logger.clear();
  assert.equal(logger.list({ since: 0 }).length, 0);
  logger.close();
});
