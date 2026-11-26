const fs = require('node:fs');
const path = require('node:path');
const { resolveEnv } = require('./env');
const { Logger } = require('./logger');
const { MomoService } = require('./service');
const { createApp } = require('./app');

async function main() {
  const env = resolveEnv();
  const logger = new Logger(path.join(env.dataDir, 'logs'));
  await logger.init();
  const service = new MomoService({ env, logger });
  await service.init();
  const app = createApp({ env, service, logger });

  let server;
  if (env.socketPath) {
    await fs.promises.mkdir(path.dirname(env.socketPath), { recursive: true });
    try {
      const stat = await fs.promises.lstat(env.socketPath);
      if (!stat.isSocket()) {
        throw new Error(`拒绝覆盖非 Socket 文件：${env.socketPath}`);
      }
      await fs.promises.unlink(env.socketPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    server = app.listen(env.socketPath);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    await fs.promises.chmod(env.socketPath, 0o660);
    logger.info('app', `统一网关服务已监听 ${env.socketPath}${env.gatewayPrefix}`);
  } else {
    server = app.listen(env.port, env.host);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    logger.info('app', `开发服务已监听 http://${env.host}:${env.port}${env.gatewayPrefix}`);
  }

  service.startCore();

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info('app', `收到 ${signal}，正在退出`);
    try {
      await service.core.stop();
    } catch (error) {
      logger.error('app', `停止核心失败：${error.message}`);
    }
    service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    if (env.socketPath) {
      await fs.promises.rm(env.socketPath, { force: true });
    }
    logger.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (error) => logger.error('app', error.stack || error.message));
  process.on('unhandledRejection', (error) => logger.error('app', error?.stack || String(error)));
}

main().catch((error) => {
  process.stderr.write(`Momo 启动失败：${error.stack || error.message}\n`);
  process.exit(1);
});
