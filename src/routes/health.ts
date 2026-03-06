import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { config } from '../config.js';

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  version: Type.String(),
  apiVersion: Type.String(),
  minClientVersion: Type.String(),
  features: Type.Object({
    wcl: Type.Boolean(),
    serverTranscoding: Type.Boolean(),
    s3Storage: Type.Boolean(),
  }),
  specUrl: Type.String(),
});

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Health check and feature discovery',
      description:
        'Returns server version, minimum compatible client version, and feature flags. ' +
        'No authentication required. The Electron client calls this on startup.',
      response: {
        200: HealthResponse,
      },
    },
  }, async (_request, reply) => {
    return reply.send({
      status: 'ok',
      version: '0.1.0',
      apiVersion: '1',
      minClientVersion: '0.1.0',
      features: {
        wcl: !!(config.wclClientId && config.wclClientSecret),
        serverTranscoding: false,
        s3Storage: config.storageBackend === 's3',
      },
      specUrl: '/api/openapi.yaml',
    });
  });
}
