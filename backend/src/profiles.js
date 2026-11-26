const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { badRequest, notFound, AppError } = require('./errors');
const { ensureDir, writeFileAtomic, readJson, writeJson, cleanName, safePathSegment } = require('./util');
const { parseProfile } = require('./config-builder');

const MAX_SUBSCRIPTION_BYTES = 8 * 1024 * 1024;

function parseUserInfo(header) {
  if (!header) return null;
  const result = {};
  for (const part of String(header).split(';')) {
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey?.trim();
    const value = Number(rawValue);
    if (key && Number.isFinite(value)) result[key] = value;
  }
  if (!result.upload && !result.download && !result.total) return null;
  return {
    upload: result.upload || 0,
    download: result.download || 0,
    total: result.total || 0,
    expire: result.expire || 0,
  };
}

function filenameFromDisposition(header) {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return null;
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

function trimProfileName(name) {
  return String(name)
    .replace(/\.(ya?ml|txt)$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

async function fetchSubscription(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw badRequest('订阅地址无效');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw badRequest('订阅地址必须是 HTTP 或 HTTPS');
  }
  let response;
  try {
    response = await fetch(parsedUrl, {
      headers: {
        'User-Agent': 'mihomo/1.19.34',
        Accept: 'text/yaml, application/yaml, text/plain, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') throw new AppError('订阅下载超时', { status: 504, code: 'subscription_timeout' });
    throw new AppError(`订阅下载失败：${error.message}`, { status: 502, code: 'subscription_failed' });
  }
  if (!response.ok) {
    throw new AppError(`订阅服务器返回 HTTP ${response.status}`, { status: 502, code: 'subscription_status' });
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SUBSCRIPTION_BYTES) {
    throw badRequest('订阅内容超过 8 MB');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_SUBSCRIPTION_BYTES) {
    throw badRequest('订阅内容超过 8 MB');
  }
  const profile = parseProfile(text);
  const headerName = filenameFromDisposition(response.headers.get('content-disposition'));
  const pathName = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() || '');
  const name = trimProfileName(headerName || pathName || parsedUrl.hostname || '订阅');
  return {
    name: name || '订阅',
    content: profile.content,
    proxyCount: profile.proxyCount,
    providerCount: profile.providerCount,
    subscription: parseUserInfo(response.headers.get('subscription-userinfo')),
  };
}

class ProfileManager {
  constructor({ dataDir, logger }) {
    this.dataDir = dataDir;
    this.dir = path.join(dataDir, 'profiles');
    this.indexFile = path.join(dataDir, 'profiles.json');
    this.logger = logger;
    this.items = [];
    this.activeId = null;
  }

  async init() {
    await ensureDir(this.dir);
    const stored = await readJson(this.indexFile, null);
    if (!stored) {
      await this.persist();
      return;
    }
    if (!Array.isArray(stored.items)) {
      throw new AppError('profiles.json 格式无效', { status: 500, code: 'profiles_corrupt' });
    }
    this.items = stored.items.filter((item) => item && typeof item.id === 'string');
    this.activeId = this.items.some((item) => item.id === stored.activeId) ? stored.activeId : null;
  }

  fileFor(id) {
    if (!/^p_[a-f0-9]{12}$/.test(id)) throw notFound('订阅不存在');
    return path.join(this.dir, `${safePathSegment(id)}.yaml`);
  }

  async persist() {
    await writeJson(this.indexFile, { activeId: this.activeId, items: this.items }, 0o600);
  }

  summary(item) {
    return {
      ...item,
      active: item.id === this.activeId,
    };
  }

  list() {
    return this.items.map((item) => this.summary(item));
  }

  get(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw notFound('订阅不存在');
    return item;
  }

  async readContent(id) {
    try {
      return await fs.readFile(this.fileFor(id), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') throw notFound('订阅文件不存在');
      throw error;
    }
  }

  async addFromUrl({ name, url }) {
    const fetched = await fetchSubscription(url);
    const item = {
      id: `p_${crypto.randomBytes(6).toString('hex')}`,
      name: cleanName(name, 60) || fetched.name,
      source: 'url',
      url,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      proxyCount: fetched.proxyCount,
      providerCount: fetched.providerCount,
      subscription: fetched.subscription,
    };
    await writeFileAtomic(this.fileFor(item.id), fetched.content, 0o600);
    this.items.push(item);
    await this.persist();
    this.logger.info('profiles', `已添加订阅 ${item.name}`);
    return this.summary(item);
  }

  async addFromContent({ name, content }) {
    const profile = parseProfile(content);
    const item = {
      id: `p_${crypto.randomBytes(6).toString('hex')}`,
      name: cleanName(name, 60) || '本地配置',
      source: 'manual',
      url: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      proxyCount: profile.proxyCount,
      providerCount: profile.providerCount,
      subscription: null,
    };
    await writeFileAtomic(this.fileFor(item.id), profile.content, 0o600);
    this.items.push(item);
    await this.persist();
    this.logger.info('profiles', `已添加本地配置 ${item.name}`);
    return this.summary(item);
  }

  async replaceContent(id, parsed, subscription) {
    const item = this.get(id);
    await writeFileAtomic(this.fileFor(id), parsed.content, 0o600);
    item.updatedAt = Date.now();
    item.proxyCount = parsed.proxyCount;
    item.providerCount = parsed.providerCount;
    item.subscription = subscription ?? item.subscription;
    await this.persist();
    return this.summary(item);
  }

  async rename(id, name) {
    const item = this.get(id);
    const next = cleanName(name, 60);
    if (!next) throw badRequest('名称不能为空');
    item.name = next;
    await this.persist();
    return this.summary(item);
  }

  async remove(id) {
    const item = this.get(id);
    await fs.rm(this.fileFor(id), { force: true });
    this.items = this.items.filter((entry) => entry.id !== id);
    if (this.activeId === id) this.activeId = null;
    await this.persist();
    this.logger.info('profiles', `已删除配置 ${item.name}`);
  }

  async setActive(id) {
    if (id !== null && !this.items.some((item) => item.id === id)) throw notFound('订阅不存在');
    this.activeId = id;
    await this.persist();
  }

  active() {
    if (!this.activeId) return null;
    return this.items.find((item) => item.id === this.activeId) || null;
  }

  async activeContent() {
    const item = this.active();
    if (!item) return null;
    return this.readContent(item.id);
  }
}

module.exports = { ProfileManager, fetchSubscription, parseUserInfo };
