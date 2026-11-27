const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const ENDPOINTS = [
  'http://api.ipify.org?format=json',
  'http://ip-api.com/json/?fields=query',
  'http://myip.ipip.net',
  'http://members.3322.org/dyndns/getip',
];
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

async function fetchIp(url, proxy) {
  const args = ['-sS', '--max-time', '12'];
  if (proxy) args.push('-x', proxy);
  args.push(url);
  const { stdout } = await execFileAsync('curl', args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  const match = stdout.match(IPV4);
  if (!match) throw new Error(`${new URL(url).host} 未返回 IP`);
  return match[0];
}

async function firstSuccessful(proxyUrl) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      return await fetchIp(url, proxyUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('IP 检测失败');
}

async function checkIp(proxyPort, auth = '') {
  const proxy = `http://${auth ? `${auth}@` : ''}127.0.0.1:${proxyPort}`;
  const proxyIp = await firstSuccessful(proxy);
  let directIp = '';
  try {
    directIp = await firstSuccessful('');
  } catch {
    directIp = '';
  }
  return {
    proxyIp,
    directIp,
    same: Boolean(directIp) && proxyIp === directIp,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { checkIp };
