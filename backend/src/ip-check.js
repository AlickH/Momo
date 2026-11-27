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

const API_ENDPOINTS = {
  'ipip.net': { url: 'http://myip.ipip.net/json', select: (data) => data?.data?.ip },
  'ip.sb': { url: 'https://api.ip.sb/geoip', select: (data) => data?.ip },
  'ipwho.is': { url: 'https://ipwho.is', select: (data) => data?.ip },
  'ipapi.is': { url: 'https://api.ipapi.is', select: (data) => data?.ip },
};

async function curl(url, proxy) {
  const args = ['-sS', '--max-time', '12'];
  if (proxy) args.push('-x', proxy);
  args.push(url);
  const { stdout } = await execFileAsync('curl', args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  return stdout;
}

async function fetchIp(url, proxy) {
  const stdout = await curl(url, proxy);
  const match = stdout.match(IPV4);
  if (!match) throw new Error(`${new URL(url).host} 未返回 IP`);
  return match[0];
}

async function fetchApiIp(api, proxy) {
  const config = API_ENDPOINTS[api];
  if (!config) throw new Error(`未知的 IP 检测接口：${api}`);
  const stdout = await curl(config.url, proxy);
  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error(`${api} 返回格式错误`);
  }
  const ip = config.select(data);
  if (typeof ip !== 'string' || !IPV4.test(ip)) throw new Error(`${api} 未返回 IP`);
  return ip.match(IPV4)[0];
}

async function firstSuccessful(proxyUrl, api) {
  if (api && api !== 'auto') return fetchApiIp(api, proxyUrl);
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

async function checkIp(proxyPort, auth = '', api = 'auto') {
  const proxy = `http://${auth ? `${auth}@` : ''}127.0.0.1:${proxyPort}`;
  const proxyIp = await firstSuccessful(proxy, api);
  let directIp = '';
  try {
    directIp = await firstSuccessful('', api);
  } catch {
    directIp = '';
  }
  return {
    proxyIp,
    directIp,
    same: Boolean(directIp) && proxyIp === directIp,
    api: api || 'auto',
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { checkIp };
