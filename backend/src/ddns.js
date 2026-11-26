const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

const IP_ENDPOINTS = {
  A: [
    'https://api.ipify.org?format=json',
    'https://1.1.1.1/cdn-cgi/trace',
  ],
  AAAA: [
    'https://api6.ipify.org?format=json',
    'https://[2606:4700:4700::1111]/cdn-cgi/trace',
  ],
};

function parseIp(payload) {
  const text = payload.trim();
  try {
    const data = JSON.parse(text);
    if (data.ip) return String(data.ip);
  } catch {
    // Plain text response.
  }
  const match = text.match(/^ip=([0-9a-f:.]+)$/im);
  return match ? match[1] : '';
}

class DdnsManager {
  constructor({ logger }) {
    this.logger = logger;
    this.settings = null;
    this.timer = null;
    this.running = false;
    this.lastIp = '';
    this.lastError = null;
    this.lastUpdatedAt = null;
    this.lastMessage = '';
  }

  configure(settings) {
    this.settings = settings;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!settings.ddnsEnabled) return;
    const interval = Math.max(1, Number(settings.ddnsIntervalMinutes) || 5) * 60 * 1000;
    this.timer = setInterval(() => { void this.update(); }, interval);
    this.timer.unref();
    void this.update();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status() {
    return {
      enabled: Boolean(this.settings?.ddnsEnabled),
      provider: this.settings?.ddnsProvider || 'url',
      domain: this.settings?.ddnsDomain || '',
      lastIp: this.lastIp,
      lastUpdatedAt: this.lastUpdatedAt,
      lastError: this.lastError,
      lastMessage: this.lastMessage,
      running: this.running,
    };
  }

  async fetchPublicIp(recordType) {
    for (const endpoint of IP_ENDPOINTS[recordType] || IP_ENDPOINTS.A) {
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) continue;
        const ip = parseIp(await response.text());
        if (ip) return ip;
      } catch {
        // Try the next endpoint.
      }
    }
    throw new Error('无法获取公网 IP');
  }

  async updateCloudflare(settings, ip) {
    const headers = {
      Authorization: `Bearer ${settings.ddnsToken}`,
      'Content-Type': 'application/json',
    };
    const zoneQuery = new URLSearchParams({ name: settings.ddnsZone });
    const zoneResponse = await fetch(`${CLOUDFLARE_API}/zones?${zoneQuery}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const zoneData = await zoneResponse.json();
    if (!zoneData.success || !zoneData.result?.length) throw new Error('Cloudflare Zone 不存在或 Token 无权限');
    const zoneId = zoneData.result[0].id;

    const recordQuery = new URLSearchParams({
      type: settings.ddnsRecordType,
      name: settings.ddnsDomain,
    });
    const recordResponse = await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records?${recordQuery}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const recordData = await recordResponse.json();
    if (!recordData.success) throw new Error(recordData.errors?.[0]?.message || 'Cloudflare 查询记录失败');

    const body = JSON.stringify({
      type: settings.ddnsRecordType,
      name: settings.ddnsDomain,
      content: ip,
      ttl: 120,
      proxied: false,
    });
    if (recordData.result?.length) {
      const recordId = recordData.result[0].id;
      const updateResponse = await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records/${recordId}`, {
        method: 'PUT',
        headers,
        body,
        signal: AbortSignal.timeout(15000),
      });
      const updateData = await updateResponse.json();
      if (!updateData.success) throw new Error(updateData.errors?.[0]?.message || 'Cloudflare 更新记录失败');
      return `Cloudflare 已更新 ${settings.ddnsDomain} → ${ip}`;
    }

    const createResponse = await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });
    const createData = await createResponse.json();
    if (!createData.success) throw new Error(createData.errors?.[0]?.message || 'Cloudflare 创建记录失败');
    return `Cloudflare 已创建 ${settings.ddnsDomain} → ${ip}`;
  }

  async updateUrl(settings, ip) {
    const target = settings.ddnsUrl.replaceAll('{ip}', encodeURIComponent(ip));
    const response = await fetch(target, { signal: AbortSignal.timeout(15000) });
    const text = (await response.text()).trim().slice(0, 180);
    if (!response.ok) throw new Error(`DDNS URL 返回 ${response.status}${text ? `：${text}` : ''}`);
    return text || `DDNS URL 已更新 → ${ip}`;
  }

  async update() {
    if (!this.settings || !this.settings.ddnsEnabled || this.running) return this.status();
    this.running = true;
    try {
      const settings = this.settings;
      if (settings.ddnsProvider === 'url' && !settings.ddnsUrl) throw new Error('请填写 DDNS URL');
      if (settings.ddnsProvider === 'cloudflare' && (!settings.ddnsDomain || !settings.ddnsZone || !settings.ddnsToken)) {
        throw new Error('Cloudflare 需要域名、Zone 和 Token');
      }
      const ip = await this.fetchPublicIp(settings.ddnsRecordType);
      let message;
      if (settings.ddnsProvider === 'cloudflare') {
        message = await this.updateCloudflare(settings, ip);
      } else {
        message = await this.updateUrl(settings, ip);
      }
      this.lastIp = ip;
      this.lastUpdatedAt = new Date().toISOString();
      this.lastError = null;
      this.lastMessage = message;
      this.logger.info('ddns', message);
    } catch (error) {
      this.lastError = error.message;
      this.logger.warn('ddns', `更新失败：${error.message}`);
    } finally {
      this.running = false;
    }
    return this.status();
  }
}

module.exports = { DdnsManager };
