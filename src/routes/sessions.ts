import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { eq, desc, count, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { raidSessions, fights, recordings } from '../db/schema.js';
import {
  CreateSessionBody,
  UpdateSessionBody,
  SessionResponse,
  SessionListResponse,
} from '../schemas/sessions.js';
import { UuidParam, PaginationQuery, ErrorResponse } from '../schemas/common.js';

export async function sessionRoutes(app: FastifyInstance) {
  // GET /api/v1/sessions
  app.get('/sessions', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['sessions'],
      summary: 'List raid sessions',
      security: [{ bearerAuth: [] }],
      querystring: PaginationQuery,
      response: {
        200: SessionListResponse,
      },
    },
  }, async (request, reply) => {
    const { limit = 20, offset = 0 } = request.query;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(raidSessions)
        .orderBy(desc(raidSessions.date), desc(raidSessions.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(raidSessions),
    ]);

    return reply.send({
      sessions: rows.map((s) => ({
        id: s.id,
        teamId: s.teamId,
        instanceName: s.instanceName,
        date: s.date,
        wclReportCode: s.wclReportCode,
        createdAt: s.createdAt!.toISOString(),
      })),
      total: Number(total),
    });
  });

  // POST /api/v1/sessions
  app.post('/sessions', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['sessions'],
      summary: 'Create a new raid session',
      security: [{ bearerAuth: [] }],
      body: CreateSessionBody,
      response: {
        201: SessionResponse,
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { instanceName, date, wclReportCode } = request.body;

    const [session] = await db
      .insert(raidSessions)
      .values({ instanceName, date, wclReportCode })
      .returning();

    return reply.status(201).send({
      id: session.id,
      teamId: session.teamId,
      instanceName: session.instanceName,
      date: session.date,
      wclReportCode: session.wclReportCode,
      fights: [],
      createdAt: session.createdAt!.toISOString(),
    });
  });

  // GET /api/v1/sessions/:id
  app.get('/sessions/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['sessions'],
      summary: 'Get a session with its fights',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
        200: SessionResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const [session] = await db
      .select()
      .from(raidSessions)
      .where(eq(raidSessions.id, id))
      .limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const fightRows = await db
      .select({
        id: fights.id,
        encounterName: fights.encounterName,
        pullNumber: fights.pullNumber,
        kill: fights.kill,
        bossPct: fights.bossPct,
        durationMs: fights.durationMs,
        recordingCount: count(recordings.id),
      })
      .from(fights)
      .leftJoin(recordings, eq(recordings.fightId, fights.id))
      .where(eq(fights.sessionId, id))
      .groupBy(fights.id)
      .orderBy(fights.pullNumber);

    return reply.send({
      id: session.id,
      teamId: session.teamId,
      instanceName: session.instanceName,
      date: session.date,
      wclReportCode: session.wclReportCode,
      fights: fightRows.map((f) => ({
        id: f.id,
        encounterName: f.encounterName,
        pullNumber: f.pullNumber,
        kill: f.kill,
        bossPct: f.bossPct,
        durationMs: f.durationMs,
        recordingCount: Number(f.recordingCount),
      })),
      createdAt: session.createdAt!.toISOString(),
    });
  });

  // PATCH /api/v1/sessions/:id
  app.patch('/sessions/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['sessions'],
      summary: 'Update a session',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      body: UpdateSessionBody,
      response: {
        200: Type.Omit(SessionResponse, ['fights']),
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const patch = request.body;

    const [updated] = await db
      .update(raidSessions)
      .set(patch)
      .where(eq(raidSessions.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return reply.send({
      id: updated.id,
      teamId: updated.teamId,
      instanceName: updated.instanceName,
      date: updated.date,
      wclReportCode: updated.wclReportCode,
      createdAt: updated.createdAt!.toISOString(),
    });
  });

  // DELETE /api/v1/sessions/:id
  app.delete('/sessions/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['sessions'],
      summary: 'Delete a session',
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
      .delete(raidSessions)
      .where(eq(raidSessions.id, id))
      .returning({ id: raidSessions.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return reply.status(204).send();
  });
}
