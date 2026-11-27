const HISTORY_SIZE = 120;

class StatsMonitor {
  constructor({ logger }) {
    this.logger = logger;
    this.controller = null;
    this.listeners = new Set();
    this.generation = 0;
    this.reconnectTimer = null;
    this.trafficSocket = null;
    this.memorySocket = null;
    this.connectionsTimer = null;
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
    this.memoryHistory = Array.from({ length: HISTORY_SIZE }, (_, index) => ({
      t: Date.now() - (HISTORY_SIZE - 1 - index) * 1000,
      value: 0,
    }));
    this.connectionsHistory = Array.from({ length: HISTORY_SIZE }, (_, index) => ({
      t: Date.now() - (HISTORY_SIZE - 1 - index) * 1000,
      value: 0,
    }));
    this.activeConnections = new Map();
    this.connectionHistory = [];
  }

  onSample(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitSample() {
    if (!this.listeners.size) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.warn('stats', `推送流量样本失败：${error.message}`);
      }
    }
  }

  attach({ controller }) {
    if (this.controller === controller && this.trafficSocket) return;
    this.detach();
    this.controller = controller;
    const generation = ++this.generation;
    this.connectTraffic(controller, generation);
    this.connectMemory(controller, generation);
    this.connectionsTimer = setInterval(() => { void this.pollConnections(); }, 1000);
    this.connectionsTimer.unref();
    void this.pollConnections();
  }

  async pollConnections() {
    if (!this.controller) return;
    try {
      const data = await this.controller.connections();
      const current = Array.isArray(data?.connections) ? data.connections : [];
      const currentIds = new Set();
      for (const item of current) {
        if (!item?.id) continue;
        currentIds.add(item.id);
        this.activeConnections.set(item.id, item);
      }
      for (const [id, item] of this.activeConnections) {
        if (currentIds.has(id)) continue;
        this.connectionHistory.push({ ...item, closedAt: Date.now() });
        this.activeConnections.delete(id);
      }
      if (this.connectionHistory.length > 1000) {
        this.connectionHistory.splice(0, this.connectionHistory.length - 1000);
      }
      this.connectionsHistory.push({ t: Date.now(), value: current.length });
      if (this.connectionsHistory.length > HISTORY_SIZE) {
        this.connectionsHistory.splice(0, this.connectionsHistory.length - HISTORY_SIZE);
      }
    } catch {
      // Keep the last value while the controller is unavailable.
    }
  }

  connectTraffic(controller, generation) {
    const socket = new WebSocket(controller.wsUrl('/traffic'));
    this.trafficSocket = socket;
    socket.onopen = () => {
      this.reachable = true;
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      try {
        const data = JSON.parse(event.data);
        this.up = Number(data.up) || 0;
        this.down = Number(data.down) || 0;
        this.upTotal = Number(data.upTotal) || this.upTotal;
        this.downTotal = Number(data.downTotal) || this.downTotal;
        this.reachable = true;
        this.history.push({ t: Date.now(), up: this.up, down: this.down });
        if (this.history.length > HISTORY_SIZE) this.history.splice(0, this.history.length - HISTORY_SIZE);
        this.emitSample();
      } catch (error) {
        this.logger.warn('stats', `解析流量数据失败：${error.message}`);
      }
    };
    const reconnect = () => {
      if (generation !== this.generation || !this.controller) return;
      this.reachable = false;
      this.reconnectTimer = setTimeout(() => {
        if (generation === this.generation && this.controller) this.connectTraffic(this.controller, generation);
      }, 1000);
    };
    socket.onclose = reconnect;
    socket.onerror = () => {};
  }

  connectMemory(controller, generation) {
    const socket = new WebSocket(controller.wsUrl('/memory'));
    this.memorySocket = socket;
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      try {
        const data = JSON.parse(event.data);
        this.memory = Number(data.inuse) || 0;
        this.memoryHistory.push({ t: Date.now(), value: this.memory });
        if (this.memoryHistory.length > HISTORY_SIZE) {
          this.memoryHistory.splice(0, this.memoryHistory.length - HISTORY_SIZE);
        }
      } catch {
        // Ignore malformed memory frames.
      }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (generation !== this.generation || !this.controller) return;
      setTimeout(() => {
        if (generation === this.generation && this.controller) this.connectMemory(this.controller, generation);
      }, 1000);
    };
  }

  detach() {
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectionsTimer) clearInterval(this.connectionsTimer);
    this.connectionsTimer = null;
    this.reconnectTimer = null;
    for (const socket of [this.trafficSocket, this.memorySocket]) {
      if (!socket) continue;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
    this.trafficSocket = null;
    this.memorySocket = null;
    this.controller = null;
    this.reset();
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
      memoryHistory: this.memoryHistory,
      connectionsHistory: this.connectionsHistory,
    };
  }
}

module.exports = { StatsMonitor };
