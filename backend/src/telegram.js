const TELEGRAM_API = 'https://api.telegram.org';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TelegramBot {
  constructor({ service, logger }) {
    this.service = service;
    this.logger = logger;
    this.generation = 0;
    this.token = '';
    this.chatId = '';
    this.notifyEnabled = false;
    this.offset = 0;
    this.abort = null;
    this.running = false;
    this.notifiedError = null;
  }

  configure(settings) {
    const token = settings.telegramToken || '';
    const chatId = settings.telegramChatId || '';
    const enabled = Boolean(settings.telegramEnabled && token && chatId);
    this.notifyEnabled = Boolean(settings.telegramNotify);
    if (this.running && this.token === token && this.chatId === chatId && Boolean(this.enabled) === enabled) return;
    this.stop();
    this.token = token;
    this.chatId = chatId;
    this.enabled = enabled;
    if (enabled) {
      this.running = true;
      const generation = ++this.generation;
      void this.loop(generation);
      this.logger.info('telegram', `Telegram Bot 已启动，Chat ID ${chatId}`);
    }
  }

  stop() {
    this.running = false;
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
  }

  async call(method, payload = {}) {
    const controller = new AbortController();
    this.abort = controller;
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.description || `Telegram ${method} 失败`);
      return data.result;
    } finally {
      clearTimeout(timer);
      if (this.abort === controller) this.abort = null;
    }
  }

  async loop(generation) {
    while (this.running && generation === this.generation) {
      try {
        const updates = await this.call('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message'] });
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update).catch((error) => {
            this.logger.warn('telegram', `处理命令失败：${error.message}`);
          });
        }
      } catch (error) {
        if (!this.running || generation !== this.generation || error.name === 'AbortError') return;
        this.logger.warn('telegram', `轮询失败：${error.message}`);
        await sleep(5000);
      }
    }
  }

  async send(text) {
    if (!this.chatId) return;
    await this.call('sendMessage', {
      chat_id: this.chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  async handleUpdate(update) {
    const message = update.message;
    if (!message || !message.text) return;
    if (String(message.chat.id) !== this.chatId) return;
    const text = message.text.trim();
    if (!text.startsWith('/')) return;
    const [rawCommand, ...args] = text.split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();
    this.logger.info('telegram', `收到命令 ${command}`);
    try {
      if (command === '/start') {
        await this.service.startCoreControl();
        await this.send('内核已启动');
      } else if (command === '/stop') {
        await this.service.stopCoreControl();
        await this.send('内核已停止');
      } else if (command === '/restart') {
        await this.service.restartCore();
        await this.send('内核已重启');
      } else if (command === '/update') {
        const result = await this.service.updateAllProfiles();
        const failed = result.results.filter((item) => !item.ok);
        await this.send(`订阅更新完成：${result.results.length - failed.length}/${result.results.length} 成功${failed.length ? `\n失败：${failed.map((item) => item.name).join('、')}` : ''}`);
      } else if (command === '/status') {
        const status = await this.service.getStatus();
        const traffic = status.traffic;
        await this.send([
          `内核：${status.core.state}`,
          `配置：${status.activeProfile?.name || '未启用'}`,
          `上传：${traffic.up} B/s  下载：${traffic.down} B/s`,
          `连接：${status.connections}`,
          `内存：${(traffic.memory / 1024 / 1024).toFixed(1)} MB`,
        ].join('\n'));
      } else if (command === '/mode') {
        const mode = (args[0] || '').toLowerCase();
        if (!['rule', 'global', 'direct'].includes(mode)) throw new Error('用法：/mode rule|global|direct');
        await this.service.setMode(mode);
        await this.send(`已切换为 ${mode} 模式`);
      } else {
        await this.send([
          'Momo 命令：',
          '/status 查看状态',
          '/start 启动内核',
          '/stop 停止内核',
          '/restart 重启内核',
          '/update 更新全部订阅',
          '/mode rule|global|direct 切换模式',
        ].join('\n'));
      }
    } catch (error) {
      await this.send(`命令失败：${error.message}`).catch(() => {});
    }
  }

  notifyCoreState(state) {
    if (!this.notifyEnabled || !this.chatId) return;
    if (state.state !== 'error') return;
    if (this.notifiedError === state.lastError) return;
    this.notifiedError = state.lastError;
    this.send(`内核异常：${state.lastError || '未知错误'}`).catch(() => {});
  }
}

module.exports = { TelegramBot };
