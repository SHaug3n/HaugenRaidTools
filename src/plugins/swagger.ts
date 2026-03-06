import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyInstance } from 'fastify';

export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'RaidReplay API',
        description:
          'Self-hosted WoW raid recording and replay server. ' +
          'Spec is also served live at GET /api/openapi.yaml.',
        version: '0.1.0',
      },
      tags: [
        { name: 'system', description: 'Health and discovery' },
        { name: 'auth', description: 'Authentication' },
        { name: 'sessions', description: 'Raid sessions' },
        { name: 'fights', description: 'Individual boss fights' },
        { name: 'recordings', description: 'Video recordings' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });
});
