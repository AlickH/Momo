const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const { CoreManager } = require('./core');
const { StatsMonitor } = require('./stats');
const { TelegramBot } = require('./telegram');
const { DdnsManager } = require('./ddns');
const { checkIp } = require('./ip-check');
const { TransparentManager } = require('./transparent');
const { ProfileManager, fetchSubscription } = require('./profiles');
const { SettingsStore } = require('./settings');
const { buildRuntimeConfig, parseProfile } = require('./config-builder');
const { AppError, badRequest, conflict, notFound } = require('./errors');
const { ensureDir, writeFileAtomic, findFreePort, randomSecret } = require('./util');

const DEFAULT_DELAY_URL = 'https://www.gstatic.com/generate_204';
const DELAY_CONCURRENCY = 6;

class MomoService {
  constructor({ env, logger }) {
    this.env = env;
    this.logger = logger;
    this.dataDir = env.dataDir;
    this.coreDir = path.join(this.dataDir, 'core');
    this.configPath = path.join(this.coreDir, 'config.yaml');
    this.settings = new SettingsStore(this.dataDir);
    this.profiles = new ProfileManager({ dataDir: this.dataDir, logger });
    this.stats = new StatsMonitor({ logger });
    this.telegram = new TelegramBot({ service: this, logger });
    this.ddns = new DdnsManager({ logger });
    this.transparent = new TransparentManager({ logger });
    this.transparentState = { active: false, error: null };
    this.transparentBusy = false;
    this.core = new CoreManager({
      bin: env.coreBin,
      dataDir: this.coreDir,
      logger,
      appUid: env.appUid,
      appGid: env.appGid,
      resolveController: () => this.resolveController(),
      prepareConfig: ({ controllerPort, secret, controllerHost }) =>
        this.writeRuntimeConfig(undefined, { controllerPort, secret, controllerHost }),
    });
    this.profileUpdateTimer = null;
    this.profileUpdateRunning = false;
    this.maintenanceTimer = null;
    this.lastProviderUpdate = 0;
    this.lastRuleProviderUpdate = 0;
    this.lastCoreRestart = 0;
    this.core.on('state', (state) => {
      this.telegram.notifyCoreState(state);
      if (state.state === 'running' && this.core.controller) {
        this.stats.attach({ controller: this.core.controller });
        void this.applyTransparentRules();
      } else {
        this.stats.detach();
        void this.clearTransparentRules();
      }
    });
  }

  async init() {
    await ensureDir(this.dataDir);
    await ensureDir(this.coreDir);
    await ensureDir(path.join(this.dataDir, 'logs'));
    await this.settings.load();
    this.telegram.configure(this.settings.get());
    this.ddns.configure(this.settings.get());
    await this.profiles.init();
    await this.copyGeodata();
    await this.fixCoreOwnership();
    await this.detectTunCapability();
    await this.transparent.clear();
    this.logger.info('app', `Momo ${this.env.version} 启动，数据目录 ${this.dataDir}`);
    this.profileUpdateTimer = setInterval(() => {
      void this.runScheduledProfileUpdates();
    }, 10 * 60 * 1000);
    this.profileUpdateTimer.unref();
    setTimeout(() => { void this.runScheduledProfileUpdates(); }, 2 * 60 * 1000).unref();
    this.lastProviderUpdate = Date.now();
    this.lastRuleProviderUpdate = Date.now();
    this.lastCoreRestart = Date.now();
    this.maintenanceTimer = setInterval(() => { void this.runScheduledMaintenance(); }, 5 * 60 * 1000);
    this.maintenanceTimer.unref();
  }

  async runScheduledMaintenance() {
    const settings = this.settings.get();
    const now = Date.now();
    if (settings.providerUpdateHours && now - this.lastProviderUpdate >= settings.providerUpdateHours * 3600 * 1000) {
      this.lastProviderUpdate = now;
      try {
        await this.updateAllProviders();
        this.logger.info('app', '定时更新全部 provider 完成');
      } catch (error) {
        this.logger.warn('app', `定时更新 provider 失败：${error.message}`);
      }
    }
    if (settings.ruleProviderUpdateHours && now - this.lastRuleProviderUpdate >= settings.ruleProviderUpdateHours * 3600 * 1000) {
      this.lastRuleProviderUpdate = now;
      try {
        await this.updateAllRuleProviders();
        this.logger.info('app', '定时更新全部规则集完成');
      } catch (error) {
        this.logger.warn('app', `定时更新规则集失败：${error.message}`);
      }
    }
    if (settings.coreRestartHours && now - this.lastCoreRestart >= settings.coreRestartHours * 3600 * 1000) {
      this.lastCoreRestart = now;
      try {
        await this.core.restart();
        this.logger.info('app', '定时重启内核完成');
      } catch (error) {
        this.logger.warn('app', `定时重启内核失败：${error.message}`);
      }
    }
  }

  async runScheduledProfileUpdates() {
    if (this.profileUpdateRunning) return;
    const hours = this.settings.get().subscriptionUpdateHours;
    if (!hours) return;
    this.profileUpdateRunning = true;
    try {
      const now = Date.now();
      for (const profile of this.profiles.list()) {
        if (profile.source !== 'url' || !profile.url) continue;
        if (now - profile.updatedAt < hours * 3600 * 1000) continue;
        try {
          await this.updateProfile(profile.id);
          this.logger.info('profiles', `定时更新订阅 ${profile.name}`);
        } catch (error) {
          this.logger.warn('profiles', `定时更新订阅失败 ${profile.name}：${error.message}`);
        }
      }
    } finally {
      this.profileUpdateRunning = false;
    }
  }

  async resolveController() {
    const settings = this.settings.get();
    if (settings.externalController) {
      return {
        host: '0.0.0.0',
        port: settings.externalControllerPort,
        secret: settings.externalControllerSecret,
      };
    }
    return { host: '127.0.0.1', port: await findFreePort(), secret: randomSecret() };
  }

  async detectTunCapability() {
    try {
      const { stdout } = await execFileAsync('getcap', [this.env.coreBin], { timeout: 3000 });
      this.tunCapable = /cap_net_admin/.test(stdout);
    } catch {
      this.tunCapable = false;
    }
  }

  async fixCoreOwnership() {
    if (process.getuid?.() !== 0 || !this.env.appUid) return;
    const walk = async (target) => {
      await fs.chown(target, this.env.appUid, this.env.appGid || this.env.appUid);
      const stat = await fs.stat(target);
      if (!stat.isDirectory()) return;
      for (const entry of await fs.readdir(target)) await walk(path.join(target, entry));
    };
    try {
      await walk(this.coreDir);
    } catch (error) {
      this.logger.warn('app', `调整内核数据权限失败：${error.message}`);
    }
  }

  async clearTransparentRules() {
    this.transparentState = { active: false, error: null };
    await this.transparent.clear();
  }

  async applyTransparentRules() {
    if (this.transparentBusy) return;
    this.transparentBusy = true;
    try {
      const mode = this.settings.get().proxyMode;
      if (mode !== 'redir') {
        await this.clearTransparentRules();
        return;
      }
      if (process.getuid?.() !== 0) {
        this.transparentState = { active: false, error: 'Redir 透明代理需要应用以 root 运行' };
        this.logger.warn('transparent', this.transparentState.error);
        return;
      }
      if (!this.core.running) return;
      const settings = this.settings.get();
      if (!this.env.appUid) {
        this.transparentState = { active: false, error: '未能获取应用运行用户 UID，无法隔离 mihomo 流量' };
        this.logger.warn('transparent', this.transparentState.error);
        return;
      }
      await this.transparent.applyRedir({
        mihomoUid: this.env.appUid,
        redirPort: settings.redirPort,
        dnsPort: settings.dnsPort,
        mixedPort: settings.mixedPort,
        controllerPort: this.core.controllerPort,
        lanTransparent: settings.lanTransparent,
      });
      this.transparentState = { active: true, error: null };
    } catch (error) {
      this.transparentState = { active: false, error: error.message };
      this.logger.error('transparent', `应用透明代理规则失败：${error.message}`);
    } finally {
      this.transparentBusy = false;
    }
  }

  async copyGeodata() {
    const files = ['geoip.metadb', 'geosite.dat', 'Model.bin', 'ASN.mmdb'];
    for (const name of files) {
      const source = path.join(this.env.geoSourceDir, name);
      const target = path.join(this.coreDir, name);
      try {
        const sourceStat = await fs.stat(source);
        const targetStat = await fs.stat(target).catch(() => null);
        if (!targetStat || targetStat.size !== sourceStat.size) {
          await fs.copyFile(source, target);
          await fs.chmod(target, 0o644);
          this.logger.info('app', `已准备内核数据 ${name}`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          this.logger.warn('app', `缺少内核数据 ${name}`);
        } else {
          throw error;
        }
      }
    }
  }

  async startCore() {
    try {
      await this.core.start();
    } catch (error) {
      this.logger.error('app', `核心启动失败：${error.message}`);
    }
  }

  coreSnapshot() {
    return this.core.snapshot();
  }

  async writeRuntimeConfig(content, { controllerPort, secret, controllerHost = '127.0.0.1' }) {
    const activeContent = content === undefined ? await this.profiles.activeContent() : content;
    const parsed = activeContent ? parseProfile(activeContent).config : null;
    const yaml = buildRuntimeConfig(parsed, this.settings.get(), { controllerPort, secret, controllerHost });
    await writeFileAtomic(this.configPath, yaml, 0o644);
    return this.configPath;
  }

  async buildConfig(content, { controllerPort, secret, controllerHost }) {
    const parsed = content ? parseProfile(content).config : null;
    return buildRuntimeConfig(parsed, this.settings.get(), { controllerPort, secret, controllerHost });
  }

  async currentControllerCredentials() {
    if (this.core.running) {
      return {
        controllerPort: this.core.controllerPort,
        secret: this.core.secret,
        controllerHost: this.core.controllerHost,
      };
    }
    const resolved = await this.resolveController();
    return { controllerPort: resolved.port, secret: resolved.secret, controllerHost: resolved.host };
  }

  async applyConfigYaml(yaml, { reload = true } = {}) {
    const previous = await fs.readFile(this.configPath, 'utf8').catch(() => null);
    await writeFileAtomic(this.configPath, yaml, 0o644);
    if (!reload || !this.core.running) return;
    try {
      await this.core.reload(this.configPath);
    } catch (error) {
      this.logger.warn('core', `配置热重载失败，改为重启核心：${error.message}`);
      try {
        await this.core.restart();
      } catch (restartError) {
        if (previous) await writeFileAtomic(this.configPath, previous, 0o644);
        throw restartError;
      }
    }
  }

  async getStatus() {
    const active = this.profiles.active();
    const core = this.core.snapshot();
    const traffic = this.stats.snapshot();
    let connectionCount = 0;
    if (core.state === 'running' && this.core.controller) {
      try {
        const data = await this.core.controller.connections();
        connectionCount = Array.isArray(data?.connections) ? data.connections.length : 0;
      } catch {
        connectionCount = 0;
      }
    }
    return {
      core,
      settings: this.settings.get(),
      activeProfile: active ? this.profiles.summary(active) : null,
      profileCount: this.profiles.list().length,
      traffic: { up: traffic.up, down: traffic.down, upTotal: traffic.upTotal, downTotal: traffic.downTotal, memory: traffic.memory },
      connections: connectionCount,
      app: {
        version: this.env.version,
        gatewayPrefix: this.env.gatewayPrefix,
        packaged: this.env.packaged,
        platform: `${os.platform()} ${os.arch()}`,
        dataDir: this.dataDir,
        tunCapable: Boolean(this.tunCapable),
        rootMode: process.getuid?.() === 0,
        transparentActive: this.transparentState.active,
        transparentError: this.transparentState.error,
      },
    };
  }

  async updateSettings(patch) {
    const before = this.settings.get();
    const next = await this.settings.update(patch);
    this.telegram.configure(next);
    this.ddns.configure(next);
    try {
      await this.core.restart();
      return next;
    } catch (error) {
      this.logger.error('app', `应用设置失败：${error.message}`);
      throw new AppError(`设置已保存，但核心重启失败：${error.message}`, {
        status: 500,
        code: 'core_restart_failed',
        details: { previous: before, next },
      });
    }
  }

  async setMode(mode) {
    if (!['rule', 'global', 'direct'].includes(mode)) throw badRequest('模式无效');
    if (!this.core.running) throw conflict('核心尚未运行');
    await this.core.controller.patchConfigs({ mode });
    await this.settings.update({ mode });
    const credentials = { controllerPort: this.core.controllerPort, secret: this.core.secret, controllerHost: this.core.controllerHost };
    await this.writeRuntimeConfig(undefined, credentials);
    return this.settings.get();
  }

  async listProfiles() {
    return this.profiles.list();
  }

  async addProfileFromUrl({ name, url }) {
    if (!url || typeof url !== 'string') throw badRequest('请输入订阅地址');
    const profile = await this.profiles.addFromUrl({ name, url });
    if (!this.profiles.activeId) {
      try {
        await this.activateProfile(profile.id);
      } catch (error) {
        await this.profiles.remove(profile.id);
        throw error;
      }
    }
    return profile;
  }

  async addProfileFromContent({ name, content }) {
    const profile = await this.profiles.addFromContent({ name, content });
    if (!this.profiles.activeId) {
      try {
        await this.activateProfile(profile.id);
      } catch (error) {
        await this.profiles.remove(profile.id);
        throw error;
      }
    }
    return profile;
  }

  async activateProfile(id) {
    const content = await this.profiles.readContent(id);
    const credentials = await this.currentControllerCredentials();
    const yaml = await this.buildConfig(content, credentials);
    const previousActive = this.profiles.activeId;
    await this.profiles.setActive(id);
    try {
      await this.applyConfigYaml(yaml);
    } catch (error) {
      await this.profiles.setActive(previousActive);
      throw error;
    }
    if (!this.core.running && this.core.state !== 'starting') {
      await this.core.start();
    }
    this.logger.info('profiles', `已启用配置 ${this.profiles.get(id).name}`);
    return this.profiles.summary(this.profiles.get(id));
  }

  async updateProfile(id) {
    const item = this.profiles.get(id);
    if (item.source !== 'url' || !item.url) throw badRequest('只有订阅链接配置可以更新');
    const fetched = await fetchSubscription(item.url);
    const parsed = parseProfile(fetched.content);
    const credentials = await this.currentControllerCredentials();
    const yaml = await this.buildConfig(parsed.content, credentials);
    const isActive = this.profiles.activeId === id;
    await this.profiles.replaceContent(id, parsed, fetched.subscription);
    if (isActive) {
      await this.applyConfigYaml(yaml);
    }
    return this.profiles.summary(this.profiles.get(id));
  }

  async renameProfile(id, name) {
    return this.profiles.rename(id, name);
  }

  async deleteProfile(id) {
    const item = this.profiles.get(id);
    if (this.profiles.activeId === id) {
      const credentials = await this.currentControllerCredentials();
      const yaml = await this.buildConfig(null, credentials);
      await this.profiles.setActive(null);
      await this.applyConfigYaml(yaml);
    }
    await this.profiles.remove(id);
    this.logger.info('profiles', `已删除配置 ${item.name}`);
  }

  async updateAllProfiles() {
    const results = [];
    for (const profile of this.profiles.list()) {
      if (profile.source !== 'url' || !profile.url) continue;
      try {
        const updated = await this.updateProfile(profile.id);
        results.push({ id: profile.id, name: profile.name, ok: true, profile: updated });
      } catch (error) {
        results.push({ id: profile.id, name: profile.name, ok: false, error: error.message });
      }
    }
    return { results };
  }

  async exportBackup() {
    return {
      format: 'momo-backup',
      version: 1,
      appVersion: this.env.version,
      exportedAt: new Date().toISOString(),
      settings: this.settings.get(),
      profiles: await this.profiles.exportAll(),
    };
  }

  async restoreBackup(payload) {
    if (!payload || payload.format !== 'momo-backup' || !payload.profiles) {
      throw badRequest('备份文件格式无效');
    }
    await this.settings.update(payload.settings || {});
    await this.profiles.importAll(payload.profiles);
    const credentials = await this.currentControllerCredentials();
    await this.writeRuntimeConfig(undefined, credentials);
    if (this.core.running) await this.core.restart();
    this.logger.info('app', '已从备份恢复配置');
    return this.getStatus();
  }

  async getProfileContent(id) {
    return { content: await this.profiles.readContent(id) };
  }

  async reloadCore() {
    const credentials = await this.currentControllerCredentials();
    const yaml = await this.buildConfig(await this.profiles.activeContent(), credentials);
    await this.applyConfigYaml(yaml);
    return this.core.snapshot();
  }

  async startCoreControl() {
    if (!this.core.running) await this.core.start();
    return this.core.snapshot();
  }

  async stopCoreControl() {
    await this.core.stop();
    return this.core.snapshot();
  }

  async restartCore() {
    await this.core.restart();
    return this.core.snapshot();
  }

  async getConfigs() {
    return this.core.controllerOrThrow().configs();
  }

  async getProxies() {
    const controller = this.core.controllerOrThrow();
    const [data, providerData] = await Promise.all([
      controller.proxies(),
      controller.providers().catch(() => ({ providers: {} })),
    ]);
    const raw = data.proxies || {};
    const groups = [];
    const nodes = {};

    const addNode = (name, item, provider = '') => {
      if (!name || !item || typeof item !== 'object') return;
      const history = Array.isArray(item.history) ? item.history : [];
      const last = [...history].reverse().find((entry) => Number.isFinite(entry.delay) && entry.delay > 0);
      nodes[name] = {
        name,
        type: item.type || 'Unknown',
        udp: Boolean(item.udp),
        alive: item.alive !== false,
        delay: last ? last.delay : null,
        history: history.slice(-12),
        ...(provider ? { provider } : {}),
      };
    };

    for (const [name, item] of Object.entries(raw)) {
      if (!item || typeof item !== 'object') continue;
      addNode(name, item);
      if (Array.isArray(item.all) && name !== 'GLOBAL') {
        groups.push({
          name,
          type: item.type || 'Selector',
          now: item.now || '',
          all: item.all.slice(),
          icon: item.icon || '',
          hidden: Boolean(item.hidden),
          testUrl: item.testUrl || '',
        });
      }
    }

    for (const [providerName, provider] of Object.entries(providerData.providers || {})) {
      if (!provider || provider.vehicleType === 'Compatible') continue;
      for (const proxy of provider.proxies || []) {
        addNode(proxy.name, proxy, providerName);
      }
    }

    if (groups.length === 0 && raw.GLOBAL && Array.isArray(raw.GLOBAL.all)) {
      groups.push({
        name: 'GLOBAL',
        type: raw.GLOBAL.type || 'Selector',
        now: raw.GLOBAL.now || '',
        all: raw.GLOBAL.all.slice(),
        icon: raw.GLOBAL.icon || '',
        hidden: false,
        testUrl: raw.GLOBAL.testUrl || '',
      });
    }
    const flat = Object.values(nodes).filter((node) => !groups.some((group) => group.name === node.name));
    return { groups, nodes, flat };
  }

  async selectProxy(group, name) {
    if (!group || !name) throw badRequest('缺少代理组或节点');
    await this.core.controllerOrThrow().selectProxy(group, name);
    return { ok: true };
  }

  async testGroupDelay({ group, url = DEFAULT_DELAY_URL, timeout = 5000 }) {
    if (!group || typeof group !== 'string') throw badRequest('缺少策略组');
    let target;
    try {
      target = new URL(url);
    } catch {
      throw badRequest('测速地址无效');
    }
    if (!['http:', 'https:'].includes(target.protocol)) throw badRequest('测速地址必须是 HTTP 或 HTTPS');
    const delayTimeout = Math.min(Math.max(Number(timeout) || 5000, 1000), 10000);
    const controller = this.core.controllerOrThrow();
    const proxyData = await controller.proxies();
    const groupNode = proxyData.proxies?.[group];
    if (!groupNode || !Array.isArray(groupNode.all)) throw badRequest('策略组不存在');
    let raw;
    try {
      raw = await controller.groupDelay(group, target.toString(), delayTimeout);
    } catch (error) {
      throw new AppError(`测速失败：${error.message}`, { status: 502, code: 'group_delay_failed' });
    }
    const results = {};
    const groupLimit = Math.min(delayTimeout, 3000);
    for (const name of groupNode.all) {
      const value = Number(raw?.[name]);
      results[name] = Number.isFinite(value) && value > 0 && value < groupLimit ? value : -1;
    }
    return { group, results };
  }

  async testDelay({ names, url = DEFAULT_DELAY_URL, timeout = 5000 }) {
    if (!Array.isArray(names) || names.length === 0) throw badRequest('请选择要测试的节点');
    if (names.length > 300) throw badRequest('一次最多测试 300 个节点');
    if (!names.every((name) => typeof name === 'string' && name.length > 0)) {
      throw badRequest('节点名称无效');
    }
    let target;
    try {
      target = new URL(url);
    } catch {
      throw badRequest('测速地址无效');
    }
    if (!['http:', 'https:'].includes(target.protocol)) throw badRequest('测速地址必须是 HTTP 或 HTTPS');
    const delayTimeout = Math.min(Math.max(Number(timeout) || 5000, 1000), 10000);
    const controller = this.core.controllerOrThrow();
    const [proxyData, providerData] = await Promise.all([
      controller.proxies(),
      controller.providers().catch(() => ({ providers: {} })),
    ]);
    const proxyKeys = new Set(Object.keys(proxyData.proxies || {}));
    const providerNodes = new Set();
    for (const provider of Object.values(providerData.providers || {})) {
      if (!provider || provider.vehicleType === 'Compatible') continue;
      for (const proxy of provider.proxies || []) providerNodes.add(proxy.name);
    }
    const results = {};
    const testUrl = target.toString();
    const inlineNames = [];
    const providerTargets = [];
    for (const name of names) {
      if (proxyKeys.has(name)) inlineNames.push(name);
      else if (providerNodes.has(name)) providerTargets.push(name);
      else results[name] = -1;
    }

    let cursor = 0;
    const workers = Array.from({ length: Math.min(DELAY_CONCURRENCY, inlineNames.length) }, async () => {
      while (cursor < inlineNames.length) {
        const name = inlineNames[cursor++];
        try {
          const result = await controller.proxyDelay(name, testUrl, delayTimeout);
          const delay = Number(result?.delay);
          results[name] = Number.isFinite(delay) && delay > 0 && delay < delayTimeout ? delay : -1;
        } catch {
          results[name] = -1;
        }
      }
    });
    await Promise.all(workers);

    const providerByNode = new Map();
    for (const [providerName, provider] of Object.entries(providerData.providers || {})) {
      if (!provider || provider.vehicleType === 'Compatible') continue;
      for (const proxy of provider.proxies || []) providerByNode.set(proxy.name, providerName);
    }
    let providerCursor = 0;
    const providerWorkers = Array.from({ length: Math.min(DELAY_CONCURRENCY, providerTargets.length) }, async () => {
      while (providerCursor < providerTargets.length) {
        const name = providerTargets[providerCursor++];
        try {
          const result = await controller.providerProxyDelay(providerByNode.get(name), name, testUrl, delayTimeout);
          const delay = Number(result?.delay);
          results[name] = Number.isFinite(delay) && delay > 0 && delay < delayTimeout ? delay : -1;
        } catch {
          results[name] = -1;
        }
      }
    });
    await Promise.all(providerWorkers);

    return { results };
  }

  async getProviders() {
    const data = await this.core.controllerOrThrow().providers();
    const providers = Object.entries(data.providers || {})
      .filter(([, item]) => item.vehicleType && item.vehicleType !== 'Compatible')
      .map(([name, item]) => ({
        name,
        type: item.type || 'Proxy',
        vehicleType: item.vehicleType || '',
        count: Array.isArray(item.proxies) ? item.proxies.length : 0,
        updatedAt: item.updatedAt && !String(item.updatedAt).startsWith('0001-') ? item.updatedAt : null,
        subscriptionInfo: item.subscriptionInfo ? {
          upload: Number(item.subscriptionInfo.Upload) || 0,
          download: Number(item.subscriptionInfo.Download) || 0,
          total: Number(item.subscriptionInfo.Total) || 0,
          expire: Number(item.subscriptionInfo.Expire) || 0,
        } : null,
      }));
    return { providers };
  }

  async updateProvider(name) {
    await this.core.controllerOrThrow().updateProvider(name);
    return { ok: true };
  }

  async updateAllProviders() {
    const controller = this.core.controllerOrThrow();
    const data = await controller.providers();
    const results = [];
    for (const [name, item] of Object.entries(data.providers || {})) {
      if (!item || item.vehicleType === 'Compatible') continue;
      try {
        await controller.updateProvider(name);
        results.push({ name, ok: true });
      } catch (error) {
        results.push({ name, ok: false, error: error.message });
      }
    }
    return { results };
  }

  async healthcheckProvider(name) {
    await this.core.controllerOrThrow().healthcheckProvider(name);
    return { ok: true };
  }

  async getRules() {
    const data = await this.core.controllerOrThrow().rules();
    return { rules: Array.isArray(data.rules) ? data.rules : [] };
  }

  async getRuleProviders() {
    const data = await this.core.controllerOrThrow().ruleProviders();
    const providers = Object.entries(data.providers || {})
      .filter(([, item]) => item.vehicleType !== 'Compatible')
      .map(([name, item]) => ({
        name,
        type: item.type || 'Rule',
        behavior: item.behavior || '',
        ruleCount: item.ruleCount || 0,
        updatedAt: item.updatedAt && !String(item.updatedAt).startsWith('0001-') ? item.updatedAt : null,
        vehicleType: item.vehicleType || '',
      }));
    return { providers };
  }

  async updateRuleProvider(name) {
    if (!name) throw badRequest('缺少规则集名称');
    await this.core.controllerOrThrow().updateRuleProvider(name);
    return { ok: true };
  }

  async updateAllRuleProviders() {
    const { providers } = await this.getRuleProviders();
    const updated = [];
    for (const provider of providers) {
      try {
        await this.core.controllerOrThrow().updateRuleProvider(provider.name);
        updated.push(provider.name);
      } catch (error) {
        this.logger.warn('rules', `更新规则集失败 ${provider.name}：${error.message}`);
      }
    }
    return { updated };
  }

  async checkIp() {
    let auth = '';
    try {
      const parsed = parseProfile(await fs.readFile(this.configPath, 'utf8')).config;
      const entry = Array.isArray(parsed.authentication) ? parsed.authentication[0] : null;
      if (typeof entry === 'string') auth = entry;
    } catch {
      auth = '';
    }
    try {
      return await checkIp(this.settings.get().mixedPort, auth);
    } catch (error) {
      throw new AppError(`IP 检测失败：${error.message}`, { status: 502, code: 'ip_check_failed' });
    }
  }

  async getSmartWeights() {
    const data = await this.core.controllerOrThrow().smartWeights();
    return { weights: data.weights || {} };
  }

  getConnectionHistory(by = 'sourceIP') {
    const fields = {
      sourceIP: (item) => item.metadata?.sourceIP || '',
      destination: (item) => item.metadata?.host || item.metadata?.destinationIP || '',
      process: (item) => item.metadata?.process || item.metadata?.processPath || '',
      outbound: (item) => (Array.isArray(item.chains) && item.chains[0]) || '',
      rule: (item) => item.rule || '',
    };
    const keyOf = fields[by] || fields.sourceIP;
    const aggregates = new Map();
    for (const item of this.stats.connectionHistory) {
      const key = keyOf(item) || '未知';
      const entry = aggregates.get(key) || { key, upload: 0, download: 0, count: 0 };
      entry.upload += Number(item.upload) || 0;
      entry.download += Number(item.download) || 0;
      entry.count += 1;
      aggregates.set(key, entry);
    }
    const items = [...aggregates.values()].sort((a, b) => (b.upload + b.download) - (a.upload + a.download));
    return {
      by,
      items,
      totals: items.reduce((total, item) => ({
        upload: total.upload + item.upload,
        download: total.download + item.download,
        count: total.count + item.count,
      }), { upload: 0, download: 0, count: 0 }),
    };
  }

  clearConnectionHistory() {
    this.stats.connectionHistory = [];
    return { ok: true };
  }

  async getConnections() {
    const data = await this.core.controllerOrThrow().connections();
    const connections = (Array.isArray(data.connections) ? data.connections : []).map((item) => ({
      id: item.id,
      host: item.metadata?.host || item.metadata?.sniffHost || item.metadata?.destinationIP || '',
      destinationIP: item.metadata?.destinationIP || '',
      destinationPort: item.metadata?.destinationPort || '',
      sourceIP: item.metadata?.sourceIP || '',
      network: item.metadata?.network || '',
      type: item.metadata?.type || '',
      process: item.metadata?.process || item.metadata?.processPath || '',
      rule: item.rule || '',
      rulePayload: item.rulePayload || '',
      chains: Array.isArray(item.chains) ? item.chains : [],
      upload: item.upload || 0,
      download: item.download || 0,
      start: item.start || '',
    }));
    connections.sort((a, b) => String(b.start).localeCompare(String(a.start)));
    return {
      downloadTotal: data.downloadTotal || 0,
      uploadTotal: data.uploadTotal || 0,
      connections,
    };
  }

  async closeConnection(id) {
    await this.core.controllerOrThrow().closeConnection(id);
    return { ok: true };
  }

  async closeAllConnections() {
    await this.core.controllerOrThrow().closeAllConnections();
    return { ok: true };
  }

  async getTraffic() {
    return this.stats.snapshot();
  }

  async getLogs(query) {
    return { logs: this.logger.list(query), latestId: this.logger.latestId() };
  }

  getDdnsStatus() {
    return this.ddns.status();
  }

  async updateDdns() {
    return this.ddns.update();
  }

  async testTelegram() {
    this.telegram.configure(this.settings.get());
    await this.telegram.send('Momo Telegram Bot 测试消息');
    return { ok: true };
  }

  async shutdown() {
    this.telegram.stop();
    this.ddns.stop();
    this.stats.detach();
    if (this.profileUpdateTimer) clearInterval(this.profileUpdateTimer);
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    await this.transparent.clear();
  }
}

module.exports = { MomoService, DEFAULT_DELAY_URL };
