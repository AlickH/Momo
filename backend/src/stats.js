const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const HISTORY_SIZE = 120;
const POLL_MS = 1000;

async function readRss(pid) {
  if (!pid) return 0;
  try {
    if (process.platform === 'linux') {
      const status = await fs.readFile(`/proc/${pid}/status`, 'utf8');
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
      return match ? Number(match[1]) * 1024 : 0;
    }
    const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)], { timeout: 2000 });
    const kb = Number(stdout.trim());
    return Number.isFinite(kb) ? kb * 1024 : 0;
  } catch {
    return 0;
  }
}

class StatsMonitor {
  constructor({ logger }) {
    this.logger = logger;
    this.timer = null;
    this.controller = null;
    this.pid = null;
    this.inFlight = false;
    this.tickCount = 0;
    this.reset();
  }

  reset() {
    this.upTotal = 0;
    this.downTotal = 0;
    this.up = 0;
    this.down = 0;
    this.memory = 0;
    this.reachable = false;
    this.history = Array.from({ length: HISTORY_SIZE }, (_, index) => ({
      t: Date.now() - (HISTORY_SIZE - 1 - index) * 1000,
      up: 0,
      down: 0,
    }));
    this.connections = null;
    this.connectionsAt = 0;
  }

  attach({ controller, pid }) {
    if (this.timer && this.controller === controller) return;
    this.controller = controller;
    this.pid = pid;
    this.reset();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.timer.unref();
    this.tick();
    if (pid) {
      void readRss(pid).then((bytes) => {
        if (this.pid === pid) this.memory = bytes;
      });
    }
  }

  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller = null;
    this.pid = null;
    this.reset();
  }

  async tick() {
    if (!this.controller || this.inFlight) return;
    this.inFlight = true;
    this.tickCount += 1;
    try {
      const data = await this.controller.connections();
      this.reachable = true;
      const nextUp = Number(data.uploadTotal) || 0;
      const nextDown = Number(data.downloadTotal) || 0;
      const up = Math.max(0, nextUp - this.upTotal);
      const down = Math.max(0, nextDown - this.downTotal);
      this.upTotal = nextUp;
      this.downTotal = nextDown;
      this.up = up;
      this.down = down;
      this.connections = data;
      this.connectionsAt = Date.now();
      this.history.push({ t: Date.now(), up, down });
      if (this.history.length > HISTORY_SIZE) this.history.splice(0, this.history.length - HISTORY_SIZE);
    } catch {
      this.reachable = false;
      this.up = 0;
      this.down = 0;
      this.connections = null;
      this.history.push({ t: Date.now(), up: 0, down: 0 });
      if (this.history.length > HISTORY_SIZE) this.history.splice(0, this.history.length - HISTORY_SIZE);
    } finally {
      if (this.tickCount % 5 === 0 && this.pid) this.memory = await readRss(this.pid);
      this.inFlight = false;
    }
  }

  snapshot() {
    return {
      up: this.up,
      down: this.down,
      upTotal: this.upTotal,
      downTotal: this.downTotal,
      memory: this.memory,
      reachable: this.reachable,
      history: this.history,
    };
  }

  connectionsSnapshot() {
    if (!this.connections) {
      return { downloadTotal: this.downTotal, uploadTotal: this.upTotal, connections: [] };
    }
    return this.connections;
  }
}

module.exports = { StatsMonitor, readRss };
