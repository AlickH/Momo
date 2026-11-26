const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const TOKEN_TTL_MS = 60_000;
const tokens = new Map();

function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  const now = Date.now();
  for (const [key, expires] of tokens) {
    if (expires <= now) tokens.delete(key);
  }
  return token;
}

function consumeToken(token) {
  const expires = tokens.get(token);
  tokens.delete(token);
  return Boolean(expires && expires > Date.now());
}

function attachTrafficSocket(server, { service, logger }) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (!url.pathname.endsWith('/api/traffic/ws')) {
      socket.destroy();
      return;
    }
    if (!consumeToken(url.searchParams.get('token') || '')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      const send = (snapshot) => {
        if (client.readyState === 1) client.send(JSON.stringify(snapshot));
      };
      send(service.stats.snapshot());
      const unsubscribe = service.stats.onSample(send);
      const cleanup = () => unsubscribe();
      client.on('close', cleanup);
      client.on('error', cleanup);
      logger.info('app', '实时流量 WebSocket 已连接');
    });
  });
  return wss;
}

module.exports = { issueToken, attachTrafficSocket };
