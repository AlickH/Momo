const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { AppError, badRequest } = require('./errors');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  );
  next();
}

function createApp({ env, service, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(securityHeaders);

  app.get('/healthz', (req, res) => {
    res.json({ ok: true, version: env.version });
  });

  app.use((req, res, next) => {
    if (!env.gatewayPrefix) return next();
    if (req.url === env.gatewayPrefix) {
      req.url = '/';
    } else if (req.url.startsWith(`${env.gatewayPrefix}/`)) {
      req.url = req.url.slice(env.gatewayPrefix.length);
    } else if (!env.dev) {
      return res.status(404).json({ error: 'Not Found' });
    }
    return next();
  });

  app.use(express.json({ limit: '10mb' }));

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const userId = req.headers['x-trim-userid'];
    const isAdmin = req.headers['x-trim-isadmin'] === 'true';
    if (!userId) {
      if (!env.allowNoAuth) {
        return res.status(401).json({ error: '请通过飞牛 fnOS 统一网关访问' });
      }
      req.user = { id: 'local', username: 'local', isAdmin: true, local: true };
      return next();
    }
    if (!isAdmin) {
      return res.status(403).json({ error: '仅管理员可以管理代理设置' });
    }
    req.user = {
      id: String(userId),
      username: String(req.headers['x-trim-username'] || ''),
      isAdmin: true,
      local: false,
    };
    return next();
  });

  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-momo-request') !== '1') {
      return res.status(403).json({ error: '缺少请求标识，请刷新页面重试' });
    }
    return next();
  });

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true, version: env.version }));
  api.get('/me', (req, res) => res.json({ user: req.user }));

  api.get('/status', asyncRoute(async (req, res) => res.json(await service.getStatus())));
  api.get('/settings', (req, res) => res.json({ settings: service.settings.get() }));
  api.patch('/settings', asyncRoute(async (req, res) => {
    const settings = await service.updateSettings(req.body || {});
    res.json({ settings, status: await service.getStatus() });
  }));

  api.post('/core/mode', asyncRoute(async (req, res) => {
    const mode = req.body?.mode;
    res.json({ settings: await service.setMode(mode) });
  }));
  api.post('/core/start', asyncRoute(async (req, res) => {
    res.json({ core: await service.startCoreControl() });
  }));
  api.post('/core/stop', asyncRoute(async (req, res) => {
    res.json({ core: await service.stopCoreControl() });
  }));
  api.post('/core/restart', asyncRoute(async (req, res) => {
    res.json({ core: await service.restartCore() });
  }));
  api.post('/core/reload', asyncRoute(async (req, res) => {
    res.json({ core: await service.reloadCore() });
  }));
  api.get('/core/configs', asyncRoute(async (req, res) => res.json(await service.getConfigs())));

  api.get('/traffic', asyncRoute(async (req, res) => res.json(await service.getTraffic())));
  api.get('/connections', asyncRoute(async (req, res) => res.json(await service.getConnections())));
  api.delete('/connections/:id', asyncRoute(async (req, res) => {
    res.json(await service.closeConnection(req.params.id));
  }));
  api.delete('/connections', asyncRoute(async (req, res) => {
    res.json(await service.closeAllConnections());
  }));

  api.get('/proxies', asyncRoute(async (req, res) => res.json(await service.getProxies())));
  api.post('/proxies/select', asyncRoute(async (req, res) => {
    const { group, name } = req.body || {};
    res.json(await service.selectProxy(group, name));
  }));
  api.post('/proxies/delay', asyncRoute(async (req, res) => {
    res.json(await service.testDelay(req.body || {}));
  }));
  api.post('/proxies/group-delay', asyncRoute(async (req, res) => {
    res.json(await service.testGroupDelay(req.body || {}));
  }));

  api.get('/providers', asyncRoute(async (req, res) => res.json(await service.getProviders())));
  api.post('/providers/update', asyncRoute(async (req, res) => {
    const name = req.body?.name;
    if (!name) throw badRequest('缺少提供者名称');
    res.json(await service.updateProvider(name));
  }));
  api.post('/providers/update-all', asyncRoute(async (req, res) => {
    res.json(await service.updateAllProviders());
  }));
  api.post('/providers/healthcheck', asyncRoute(async (req, res) => {
    const name = req.body?.name;
    if (!name) throw badRequest('缺少提供者名称');
    res.json(await service.healthcheckProvider(name));
  }));

  api.get('/rules', asyncRoute(async (req, res) => res.json(await service.getRules())));

  api.get('/profiles', asyncRoute(async (req, res) => res.json({ profiles: await service.listProfiles() })));
  api.post('/profiles', asyncRoute(async (req, res) => {
    const { name, url, content } = req.body || {};
    if (url && content) throw badRequest('订阅地址和内容只能填写一个');
    if (!url && !content) throw badRequest('请填写订阅地址或配置内容');
    const profile = url
      ? await service.addProfileFromUrl({ name, url })
      : await service.addProfileFromContent({ name, content });
    res.status(201).json({ profile });
  }));
  api.get('/profiles/:id/content', asyncRoute(async (req, res) => {
    res.json(await service.getProfileContent(req.params.id));
  }));
  api.post('/profiles/:id/update', asyncRoute(async (req, res) => {
    res.json({ profile: await service.updateProfile(req.params.id) });
  }));
  api.post('/profiles/update-all', asyncRoute(async (req, res) => {
    res.json(await service.updateAllProfiles());
  }));
  api.post('/profiles/:id/activate', asyncRoute(async (req, res) => {
    res.json({ profile: await service.activateProfile(req.params.id) });
  }));
  api.patch('/profiles/:id', asyncRoute(async (req, res) => {
    res.json({ profile: await service.renameProfile(req.params.id, req.body?.name) });
  }));
  api.delete('/profiles/:id', asyncRoute(async (req, res) => {
    await service.deleteProfile(req.params.id);
    res.json({ ok: true });
  }));

  api.get('/backup', asyncRoute(async (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="momo-backup.json"');
    res.json(await service.exportBackup());
  }));
  api.post('/restore', asyncRoute(async (req, res) => {
    res.json({ status: await service.restoreBackup(req.body) });
  }));

  api.get('/logs', asyncRoute(async (req, res) => {
    const since = Number(req.query.since) || 0;
    const limit = Number(req.query.limit) || 300;
    res.json(await service.getLogs({ since, limit }));
  }));
  api.post('/logs/clear', (req, res) => {
    logger.clear();
    res.json({ ok: true });
  });

  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

  const indexFile = path.join(env.webDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(env.webDir, {
      index: false,
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get(/.*/, (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexFile);
    });
  } else {
    app.get('/', (req, res) => {
      res.status(503).type('text/plain').send('前端尚未构建，请运行 npm run build:frontend');
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '请求 JSON 格式错误' });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: '请求内容过大' });
    }
    logger.error('http', error.stack || error.message);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}

module.exports = { createApp };
