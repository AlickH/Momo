const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function resolveEnv(overrides = {}) {
  const packaged = Boolean(process.env.TRIM_APPDEST);
  const appDir = overrides.appDir || process.env.TRIM_APPDEST || REPO_ROOT;
  const dataDir = overrides.dataDir || process.env.TRIM_PKGVAR || path.join(REPO_ROOT, 'dev-data');
  const webDir =
    overrides.webDir ||
    process.env.WEB_DIR ||
    (packaged ? path.join(appDir, 'web') : path.join(REPO_ROOT, 'frontend', 'dist'));
  const devCoreName = process.platform === 'darwin'
    ? `mihomo-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}-alpha-smart-1348c4d`
    : `mihomo-linux-${process.arch === 'arm64' ? 'arm64' : 'amd64-compatible'}-alpha-smart-1348c4d`;
  const coreBin =
    overrides.coreBin ||
    process.env.MIHOMO_BIN ||
    (packaged ? path.join(appDir, 'core', 'mihomo') : path.join(REPO_ROOT, 'vendor', devCoreName));
  const geoSourceDir =
    overrides.geoSourceDir || (packaged ? path.join(appDir, 'core') : path.join(REPO_ROOT, 'vendor'));

  return {
    packaged,
    dev: process.env.APP_ENV === 'dev' || overrides.dev === true,
    appDir,
    dataDir,
    webDir,
    coreBin,
    geoSourceDir,
    gatewayPrefix: (overrides.gatewayPrefix || process.env.GATEWAY_PREFIX || '/app/momo').replace(/\/+$/, ''),
    socketPath: overrides.socketPath || process.env.SOCKET_PATH || '',
    host: overrides.host || process.env.HOST || '127.0.0.1',
    port: Number(overrides.port || process.env.PORT || 5001),
    allowNoAuth: overrides.allowNoAuth ?? process.env.ALLOW_NO_AUTH === '1',
    version: process.env.TRIM_APPVER || require('../package.json').version,
  };
}

module.exports = { resolveEnv, REPO_ROOT };
