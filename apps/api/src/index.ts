import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './env.js';
import authPlugin from './plugins/auth.js';
import { registerRoutes } from './routes/index.js';
import redis from './lib/redis.js';
import { startStatusPoller, stopStatusPoller } from './lib/status-poller.js';
import { startMessengerWorker, stopMessengerWorker } from './lib/messenger-queue.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Raw request body bytes, retained for webhook signature verification. */
    rawBody?: Buffer;
  }
}

// Money columns are `bigint` (paisa). Make JSON responses just emit them as
// numbers — every amount we store comfortably fits in a JS safe integer.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin:
      env.NODE_ENV === 'production'
        ? ['https://fcommerce.app']
        : ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  });

  // Keep the raw bytes of JSON bodies around so webhook routes can verify
  // HMAC signatures (Meta's X-Hub-Signature-256) against the exact payload.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done) => {
      req.rawBody = body;
      if (!body || body.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  await app.register(authPlugin);

  await registerRoutes(app);

  app.get('/', async () => ({
    name: 'fcommerce-ops API',
    version: '0.0.1',
    status: 'running',
  }));

  return app;
}

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Best-effort start; failures are logged but do not crash the API.
  startStatusPoller().catch((err) => {
    app.log.warn({ err }, 'Status poller failed to start');
  });
  try {
    startMessengerWorker();
  } catch (err) {
    app.log.warn({ err }, 'Messenger worker failed to start');
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await stopStatusPoller().catch(() => undefined);
    await stopMessengerWorker().catch(() => undefined);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main();
