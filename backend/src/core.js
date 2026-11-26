const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { ControllerClient } = require('./controller');
const { AppError } = require('./errors');
const { findFreePort, randomSecret, sleep } = require('./util');

const START_TIMEOUT_MS = 60000;

class CoreManager extends EventEmitter {
  constructor({ bin, dataDir, logger, prepareConfig, resolveController = null, appUid = null, appGid = null }) {
    super();
    this.bin = bin;
    this.dataDir = dataDir;
    this.logger = logger;
    this.prepareConfig = prepareConfig;
    this.resolveController = resolveController;
    this.appUid = appUid;
    this.appGid = appGid;
    this.child = null;
    this.controller = null;
    this.state = 'stopped';
    this.desired = false;
    this.starting = false;
    this.pid = null;
    this.startedAt = null;
    this.lastError = null;
    this.version = null;
    this.restartTimer = null;
    this.restartAttempts = 0;
    this.nextRestartAt = null;
    this.lastOutput = [];
    this.secret = null;
    this.controllerHost = '127.0.0.1';
    this.controllerPort = null;
    this.startPromise = null;
    this.exitWaiters = [];
  }

  snapshot() {
    return {
      state: this.state,
      pid: this.pid,
      startedAt: this.startedAt,
      lastError: this.lastError,
      version: this.version,
      restartAttempts: this.restartAttempts,
      nextRestartAt: this.nextRestartAt,
      controllerReady: Boolean(this.controller),
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    Object.assign(this, extra);
    this.emit('state', this.snapshot());
  }

  get running() {
    return this.state === 'running' && Boolean(this.controller);
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.child) return;
    this.desired = true;
    this.startPromise = this._start().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async _start() {
    if (this.child) return;
    this.clearRestartTimer();
    this.starting = true;
    this.lastError = null;
    this.setState('starting', { nextRestartAt: null });

    let controllerPort;
    let controllerHost;
    let secret;
    let configPath;
    try {
      const resolved = this.resolveController
        ? await this.resolveController()
        : { port: await findFreePort(), secret: randomSecret(), host: '127.0.0.1' };
      controllerPort = resolved.port;
      controllerHost = resolved.host || '127.0.0.1';
      secret = resolved.secret;
      this.controllerPort = controllerPort;
      this.controllerHost = controllerHost;
      this.secret = secret;
      configPath = await this.prepareConfig({ controllerPort, secret, controllerHost });
    } catch (error) {
      this.starting = false;
      this.desired = false;
      this.setState('error', { lastError: error.message });
      throw error;
    }

    const controller = new ControllerClient({ port: controllerPort, secret });
    const spawnOptions = {
      cwd: this.dataDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    if (process.getuid?.() === 0 && this.appUid) {
      spawnOptions.uid = this.appUid;
      if (this.appGid) spawnOptions.gid = this.appGid;
    }
    const child = spawn(this.bin, ['-d', this.dataDir, '-f', configPath], spawnOptions);
    this.child = child;
    this.pid = child.pid;
    this.controller = controller;
    this.lastOutput = [];
    this.bindOutput(child.stdout, 'stdout');
    this.bindOutput(child.stderr, 'stderr');

    let exitInfo = null;
    const onExit = (code, signal) => {
      exitInfo = { code, signal };
      this.handleExit(code, signal);
    };
    child.on('exit', onExit);

    try {
      await this.waitForController(controller, child);
      if (exitInfo) throw new Error(this.describeExit(exitInfo));
      this.version = (await controller.version(3000)).version || null;
      this.starting = false;
      this.restartAttempts = 0;
      this.setState('running', { startedAt: Date.now(), lastError: null });
      this.logger.info('core', `mihomo ${this.version || ''} 已启动，PID ${this.pid}`);
    } catch (error) {
      this.starting = false;
      this.desired = false;
      this.lastError = error.message;
      this.logger.error('core', `核心启动失败：${error.message}`);
      if (this.child) {
        this.child.kill('SIGKILL');
        await this.waitForExit(3000);
      }
      this.child = null;
      this.controller = null;
      this.pid = null;
      this.setState('error', { lastError: error.message, startedAt: null });
      throw new AppError(error.message, { status: 500, code: 'core_start_failed' });
    }
  }

  bindOutput(stream, name) {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        this.lastOutput.push(line);
        if (this.lastOutput.length > 40) this.lastOutput.shift();
        this.logger.coreLine(line);
      }
    });
    stream.on('end', () => {
      if (buffer.trim()) {
        this.lastOutput.push(buffer);
        this.logger.coreLine(buffer);
      }
    });
    stream.on('error', (error) => this.logger.warn('core', `${name} 读取失败：${error.message}`));
  }

  async waitForController(controller, child) {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(this.describeExit({ code: child.exitCode, signal: child.signalCode }));
      }
      try {
        await controller.version(1500);
        return;
      } catch {
        await sleep(250);
      }
    }
    throw new Error('核心启动超时，控制器无响应');
  }

  describeExit({ code, signal }) {
    const reason = signal ? `信号 ${signal}` : `退出码 ${code}`;
    const tail = this.lastOutput.slice(-3).join('\n');
    return `mihomo 意外退出（${reason}）${tail ? `：\n${tail}` : ''}`;
  }

  handleExit(code, signal) {
    if (!this.child) return;
    this.child = null;
    this.controller = null;
    this.pid = null;
    const wasStarting = this.starting;
    const uptime = this.startedAt ? Date.now() - this.startedAt : 0;
    this.startedAt = null;
    this.resolveExitWaiters();

    if (!this.desired || this.state === 'stopping') {
      this.setState('stopped', { lastError: null });
      return;
    }
    if (wasStarting) return;
    this.restartAttempts = uptime > 30000 ? 1 : Math.min(this.restartAttempts + 1, 6);
    const delayMs = Math.min(30000, 2000 * 2 ** (this.restartAttempts - 1));
    const message = this.describeExit({ code, signal });
    this.logger.error('core', `${message}；${Math.round(delayMs / 1000)} 秒后自动重启`);
    this.setState('restarting', {
      lastError: message,
      nextRestartAt: Date.now() + delayMs,
    });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start().catch(() => {});
    }, delayMs);
    this.restartTimer.unref();
  }

  clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  waitForExit(timeoutMs) {
    if (!this.child) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.exitWaiters = this.exitWaiters.filter((item) => item.resolve !== wrapped);
        resolve();
      }, timeoutMs);
      const wrapped = () => {
        clearTimeout(timer);
        resolve();
      };
      this.exitWaiters.push({ resolve: wrapped });
    });
  }

  resolveExitWaiters() {
    const waiters = this.exitWaiters;
    this.exitWaiters = [];
    for (const waiter of waiters) waiter.resolve();
  }

  async stop() {
    this.desired = false;
    this.clearRestartTimer();
    if (!this.child) {
      if (this.state !== 'stopped') this.setState('stopped', { lastError: null });
      return;
    }
    this.setState('stopping');
    const child = this.child;
    child.kill('SIGTERM');
    await this.waitForExit(8000);
    if (this.child) {
      child.kill('SIGKILL');
      await this.waitForExit(2000);
    }
    this.child = null;
    this.controller = null;
    this.pid = null;
    this.setState('stopped', { lastError: null, startedAt: null });
    this.logger.info('core', 'mihomo 已停止');
  }

  async restart() {
    this.desired = true;
    await this.stop();
    this.desired = true;
    return this.start();
  }

  async reload(configPath) {
    if (!this.controller) {
      throw new AppError('核心尚未运行', { status: 409, code: 'core_not_running' });
    }
    return this.controller.reload(configPath);
  }

  controllerOrThrow() {
    if (!this.controller) {
      throw new AppError('核心尚未运行', { status: 409, code: 'core_not_running' });
    }
    return this.controller;
  }
}

module.exports = { CoreManager };
