const { AppError, upstream } = require('./errors');

class ControllerClient {
  constructor({ port, secret, timeoutMs = 8000 }) {
    this.base = `http://127.0.0.1:${port}`;
    this.secret = secret;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, body, { timeoutMs = this.timeoutMs } = {}) {
    let response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw upstream('mihomo 控制器响应超时');
      }
      throw upstream(`无法连接 mihomo 控制器：${error.message}`);
    }
    const text = await response.text();
    if (!response.ok) {
      let detail = text.trim();
      try {
        const parsed = JSON.parse(text);
        detail = parsed.message || parsed.error || detail;
      } catch {
        // Keep the raw body.
      }
      throw upstream(detail || `mihomo 控制器返回 ${response.status}`, {
        status: response.status,
      });
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async version(timeoutMs) {
    return this.request('GET', '/version', undefined, { timeoutMs });
  }

  async configs() {
    return this.request('GET', '/configs');
  }

  async patchConfigs(patch) {
    return this.request('PATCH', '/configs', patch);
  }

  async proxies() {
    return this.request('GET', '/proxies');
  }

  async selectProxy(group, name) {
    return this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name });
  }

  async proxyDelay(name, url, timeout) {
    const query = new URLSearchParams({ url, timeout: String(timeout) });
    return this.request('GET', `/proxies/${encodeURIComponent(name)}/delay?${query}`, undefined, {
      timeoutMs: timeout + 2000,
    });
  }

  async providers() {
    return this.request('GET', '/providers/proxies');
  }

  async updateProvider(name) {
    return this.request('PUT', `/providers/proxies/${encodeURIComponent(name)}`);
  }

  async healthcheckProvider(name) {
    return this.request('GET', `/providers/proxies/${encodeURIComponent(name)}/healthcheck`, undefined, {
      timeoutMs: 30000,
    });
  }

  async rules() {
    return this.request('GET', '/rules');
  }

  async connections() {
    return this.request('GET', '/connections', undefined, { timeoutMs: 5000 });
  }

  async closeConnection(id) {
    return this.request('DELETE', `/connections/${encodeURIComponent(id)}`);
  }

  async closeAllConnections() {
    return this.request('DELETE', '/connections');
  }

  async reload(path) {
    return this.request('PUT', '/configs?force=true', { path });
  }
}

function toAppError(error) {
  if (error instanceof AppError) return error;
  return upstream(error?.message || 'mihomo 请求失败');
}

module.exports = { ControllerClient, toAppError };
