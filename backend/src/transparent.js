const { spawn } = require('node:child_process');
const { AppError } = require('./errors');

const TABLE = 'momo';
const NFT_TIMEOUT_MS = 10000;

const PRIVATE_V4 = '0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4';
const PRIVATE_V6 = '::1/128, fc00::/7, fe80::/10, ff00::/8';

function runNft(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('nft', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('nft 执行超时', { status: 500, code: 'nft_timeout' }));
    }, NFT_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new AppError(`无法执行 nft：${error.message}`, { status: 500, code: 'nft_missing' }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new AppError(stderr.trim() || `nft 退出码 ${code}`, { status: 500, code: 'nft_failed' }));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function runIp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ip', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ip 退出码 ${code}`));
    });
  });
}

class TransparentManager {
  constructor({ logger }) {
    this.logger = logger;
  }

  async applyTproxy({ mihomoUid, tproxyPort, dnsPort, mixedPort, controllerPort }) {
    if (process.getuid?.() !== 0) {
      throw new AppError('TProxy 需要 root 运行应用', { status: 500, code: 'tproxy_root' });
    }
    await this.clear();
    const ports = [53, dnsPort, mixedPort, tproxyPort, controllerPort].filter(Boolean).join(', ');
    const script = `table inet ${TABLE} {
  chain prerouting_dns {
    type nat hook prerouting priority dstnat; policy accept;
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    udp dport 53 redirect to :${dnsPort}
    tcp dport 53 redirect to :${dnsPort}
  }
  chain prerouting_tproxy {
    type filter hook prerouting priority mangle; policy accept;
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    tcp dport { ${ports} } return
    udp dport { ${ports} } return
    meta l4proto { tcp, udp } tproxy to :${tproxyPort} meta mark set 0x233
  }
}
`;
    await runNft(['-f', '-'], script);
    for (const family of ['-4', '-6']) {
      try {
        await runIp([family, 'rule', 'del', 'fwmark', '0x233', 'lookup', '233']);
      } catch {}
      try {
        await runIp([family, 'route', 'flush', 'table', '233']);
      } catch {}
      await runIp([family, 'rule', 'add', 'fwmark', '0x233', 'lookup', '233']);
      await runIp([family, 'route', 'add', 'local', family === '-4' ? '0.0.0.0/0' : '::/0', 'dev', 'lo', 'table', '233']);
    }
    this.logger.info('transparent', `TProxy 已启用，端口 ${tproxyPort}，DNS 端口 ${dnsPort}`);
  }

  async clearRoutes() {
    if (process.getuid?.() !== 0) return;
    for (const family of ['-4', '-6']) {
      try {
        await runIp([family, 'rule', 'del', 'fwmark', '0x233', 'lookup', '233']);
      } catch {
        // Rule is absent.
      }
      try {
        await runIp([family, 'route', 'flush', 'table', '233']);
      } catch {
        // Table is absent.
      }
    }
  }

  async clear() {
    if (process.getuid?.() !== 0) return;
    await this.clearRoutes();
    try {
      await runNft(['delete', 'table', 'inet', TABLE]);
    } catch (error) {
      if (error.code === 'nft_missing') return;
      if (!/No such file|does not exist|not found/i.test(error.message)) {
        this.logger.warn('transparent', `清理 nftables 失败：${error.message}`);
      }
    }
  }

  async applyRedir({ mihomoUid, redirPort, dnsPort, mixedPort, controllerPort, lanTransparent = false }) {
    if (!mihomoUid || mihomoUid === 0) {
      throw new AppError('无法确定 mihomo 的运行 UID，拒绝安装透明代理规则', { status: 500, code: 'transparent_uid' });
    }
    if (process.getuid?.() !== 0) {
      throw new AppError('透明代理需要 root 运行应用', { status: 500, code: 'transparent_root' });
    }
    await this.clear();
    const ports = [22, 53, dnsPort, mixedPort, redirPort, controllerPort].filter(Boolean).join(', ');
    const lanChains = lanTransparent ? `
  chain prerouting_dns {
    type nat hook prerouting priority -90; policy accept;
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    udp dport 53 redirect to :${dnsPort}
    tcp dport 53 redirect to :${dnsPort}
  }
  chain prerouting_tcp {
    type nat hook prerouting priority -100; policy accept;
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    tcp dport { ${[53, dnsPort, mixedPort, redirPort, controllerPort].filter(Boolean).join(', ')} } return
    meta l4proto tcp redirect to :${redirPort}
  }` : '';
    const script = `table inet ${TABLE} {
  chain output_dns {
    type nat hook output priority -90; policy accept;
    meta skuid ${mihomoUid} return
    ct state != new return
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    udp dport 53 redirect to :${dnsPort}
    tcp dport 53 redirect to :${dnsPort}
  }
  chain output_tcp {
    type nat hook output priority -100; policy accept;
    meta skuid ${mihomoUid} return
    ct state != new return
    ip daddr { ${PRIVATE_V4} } return
    ip6 daddr { ${PRIVATE_V6} } return
    tcp dport { ${ports} } return
    meta l4proto tcp redirect to :${redirPort}
  }${lanChains}
}
`;
    await runNft(['-f', '-'], script);
    this.logger.info('transparent', `Redir 透明代理已启用，TCP 端口 ${redirPort}，DNS 端口 ${dnsPort}${lanTransparent ? '，已接管局域网转发' : ''}`);
  }
}

module.exports = { TransparentManager };
