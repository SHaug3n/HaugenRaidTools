import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import { swaggerPlugin } from './plugins/swagger.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { recordingRoutes } from './routes/recordings.js';
import { sessionRoutes } from './routes/sessions.js';
import { fightRoutes } from './routes/fights.js';
import { config } from './config.js';
import yaml from 'yaml';

export async function setupApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // ─── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // ─── Plugins ──────────────────────────────────────────────────────────────
  await app.register(swaggerPlugin);
  await app.register(authPlugin);

  // ─── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(recordingRoutes, { prefix: '/api/v1' });
  await app.register(sessionRoutes, { prefix: '/api/v1' });
  await app.register(fightRoutes, { prefix: '/api/v1' });

  // ─── Live OpenAPI spec endpoint ───────────────────────────────────────────
  app.get(
    '/api/openapi.yaml',
    {
      schema: {
        hide: true, // Don't list this in the spec itself
      },
    },
    async (_request, reply) => {
      const spec = app.swagger();
      reply.header('Content-Type', 'application/yaml; charset=utf-8');
      return yaml.stringify(spec);
    },
  );

  // ─── Global error handler ─────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  return app;
}
