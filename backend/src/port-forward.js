const { spawn } = require('node:child_process');
const { AppError } = require('./errors');

const TABLE = 'momo_pf';

function runNft(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('nft', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(new AppError(`无法执行 nft：${error.message}`, { status: 500, code: 'nft_missing' })));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new AppError(stderr.trim() || `nft 退出码 ${code}`, { status: 500, code: 'nft_failed' }));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

class PortForwardManager {
  constructor({ logger }) {
    this.logger = logger;
  }

  async clear() {
    if (process.getuid?.() !== 0) return;
    try {
      await runNft(['delete', 'table', 'inet', TABLE]);
    } catch (error) {
      if (error.code === 'nft_missing') return;
      if (!/No such file|does not exist|not found/i.test(error.message)) {
        this.logger.warn('port-forward', `清理端口转发失败：${error.message}`);
      }
    }
  }

  async apply(forwards) {
    if (process.getuid?.() !== 0) return;
    await this.clear();
    const rules = (Array.isArray(forwards) ? forwards : []).filter((item) => item?.enabled);
    if (!rules.length) return;
    const lines = [];
    for (const item of rules) {
      if (!/^[0-9a-fA-F:.]+$/.test(item.targetHost || '')) {
        this.logger.warn('port-forward', `跳过非法目标地址 ${item.name || item.targetHost}`);
        continue;
      }
      const family = item.targetHost.includes(':') ? 'ip6' : 'ip';
      const target = item.targetHost.includes(':') ? `[${item.targetHost}]` : item.targetHost;
      const proto = item.protocol === 'udp' ? 'udp' : 'tcp';
      lines.push(`    ${proto} dport ${Number(item.listenPort)} dnat ${family} to ${target}:${Number(item.targetPort)}`);
    }
    if (!lines.length) return;
    const script = `table inet ${TABLE} {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
${lines.join('\n')}
  }
}
`;
    await runNft(['-f', '-'], script);
    this.logger.info('port-forward', `已启用 ${lines.length} 条端口转发`);
  }
}

module.exports = { PortForwardManager };
