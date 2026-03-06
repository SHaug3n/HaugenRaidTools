import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { eq, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { fights, recordings } from '../db/schema.js';
import { CreateFightBody, FightResponse, FightListResponse } from '../schemas/fights.js';
import { UuidParam, ErrorResponse } from '../schemas/common.js';

export const fightRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // POST /api/v1/fights
  app.post('/fights', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['fights'],
      summary: 'Create a fight record',
      description: 'Called by the Electron client after a boss pull ends.',
      security: [{ bearerAuth: [] }],
      body: CreateFightBody,
      response: {
        201: FightResponse,
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const body = request.body;

    const [fight] = await db
      .insert(fights)
      .values({
        sessionId: body.sessionId,
        encounterId: body.encounterId,
        encounterName: body.encounterName,
        difficultyId: body.difficultyId,
        pullNumber: body.pullNumber,
        kill: body.kill,
        bossPct: body.bossPct,
        durationMs: body.durationMs,
        fightStartUnixMs: body.fightStartUnixMs,
        fightEndUnixMs: body.fightEndUnixMs,
      })
      .returning();

    return reply.status(201).send({
      id: fight.id,
      sessionId: fight.sessionId!,
      encounterId: fight.encounterId,
      encounterName: fight.encounterName,
      difficultyId: fight.difficultyId,
      pullNumber: fight.pullNumber,
      kill: fight.kill,
      bossPct: fight.bossPct,
      durationMs: fight.durationMs,
      fightStartUnixMs: fight.fightStartUnixMs,
      fightEndUnixMs: fight.fightEndUnixMs,
      wclFightId: fight.wclFightId,
      recordingCount: 0,
      createdAt: fight.createdAt!.toISOString(),
    });
  });

  // GET /api/v1/fights/:id
  app.get('/fights/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['fights'],
      summary: 'Get a fight by ID',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
        200: FightResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const [row] = await db
      .select({
        id: fights.id,
        sessionId: fights.sessionId,
        encounterId: fights.encounterId,
        encounterName: fights.encounterName,
        difficultyId: fights.difficultyId,
        pullNumber: fights.pullNumber,
        kill: fights.kill,
        bossPct: fights.bossPct,
        durationMs: fights.durationMs,
        fightStartUnixMs: fights.fightStartUnixMs,
        fightEndUnixMs: fights.fightEndUnixMs,
        wclFightId: fights.wclFightId,
        createdAt: fights.createdAt,
        recordingCount: count(recordings.id),
      })
      .from(fights)
      .leftJoin(recordings, eq(recordings.fightId, fights.id))
      .where(eq(fights.id, id))
      .groupBy(fights.id)
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: 'Fight not found' });
    }

    return reply.send({
      id: row.id,
      sessionId: row.sessionId!,
      encounterId: row.encounterId,
      encounterName: row.encounterName,
      difficultyId: row.difficultyId,
      pullNumber: row.pullNumber,
      kill: row.kill,
      bossPct: row.bossPct,
      durationMs: row.durationMs,
      fightStartUnixMs: row.fightStartUnixMs,
      fightEndUnixMs: row.fightEndUnixMs,
      wclFightId: row.wclFightId,
      recordingCount: Number(row.recordingCount),
      createdAt: row.createdAt!.toISOString(),
    });
  });

  // DELETE /api/v1/fights/:id
  app.delete('/fights/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['fights'],
      summary: 'Delete a fight',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
        204: Type.Null(),
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const [deleted] = await db
      .delete(fights)
      .where(eq(fights.id, id))
      .returning({ id: fights.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Fight not found' });
    }

    return reply.status(204).send(null);
  });
}
