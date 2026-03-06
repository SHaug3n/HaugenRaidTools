import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { recordings } from '../db/schema.js';
import { RecordingMetadata, UploadUrlResponse, RecordingResponse } from '../schemas/recordings.js';
import { UuidParam, ErrorResponse } from '../schemas/common.js';
import { config } from '../config.js';

function buildUploadUrl(recordingId: string): string {
  // Phase 3 will replace this with a real presigned URL (local disk or S3).
  // For now we return the direct upload endpoint.
  return `/api/v1/recordings/${recordingId}/upload`;
}

export async function recordingRoutes(app: FastifyInstance) {
  // POST /api/v1/recordings/upload-url
  app.post('/recordings/upload-url', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Request an upload URL for a new recording',
      description:
        'The client calls this before uploading a video. ' +
        'Returns a recordingId and a URL to PUT the video file to.',
      security: [{ bearerAuth: [] }],
      body: RecordingMetadata,
      response: {
        201: UploadUrlResponse,
        400: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const body = request.body;
    const userId = request.user.sub;

    // Generate a storage key based on fight/user/uuid
    const recordingId = randomUUID();
    const storageKey = `fights/${body.fightId}/${userId}/${recordingId}.mp4`;

    await db.insert(recordings).values({
      id: recordingId,
      fightId: body.fightId,
      userId,
      storageKey,
      videoStartUnixMs: body.videoStartUnixMs,
      durationMs: body.durationMs,
      status: 'uploading',
      format: 'compressed',
    });

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

    return reply.status(201).send({
      recordingId,
      uploadUrl: buildUploadUrl(recordingId),
      expiresAt: expiresAt.toISOString(),
    });
  });

  // GET /api/v1/recordings/:id
  app.get('/recordings/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Get recording metadata',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
        200: RecordingResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const [rec] = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, id))
      .limit(1);

    if (!rec) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    return reply.send({
      id: rec.id,
      fightId: rec.fightId!,
      userId: rec.userId,
      status: rec.status as 'uploading' | 'processing' | 'ready' | 'error',
      durationMs: rec.durationMs,
      videoStartUnixMs: rec.videoStartUnixMs,
      fileSizeBytes: rec.fileSizeBytes,
      format: rec.format!,
      createdAt: rec.createdAt!.toISOString(),
    });
  });

  // PATCH /api/v1/recordings/:id/status — called by upload worker to update status
  app.patch('/recordings/:id/status', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Update recording status',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      body: Type.Object({
        status: Type.Union([
          Type.Literal('uploading'),
          Type.Literal('processing'),
          Type.Literal('ready'),
          Type.Literal('error'),
        ]),
        fileSizeBytes: Type.Optional(Type.Number()),
      }),
      response: {
        200: RecordingResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status, fileSizeBytes } = request.body;

    const [updated] = await db
      .update(recordings)
      .set({ status, ...(fileSizeBytes !== undefined ? { fileSizeBytes } : {}) })
      .where(eq(recordings.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    return reply.send({
      id: updated.id,
      fightId: updated.fightId!,
      userId: updated.userId,
      status: updated.status as 'uploading' | 'processing' | 'ready' | 'error',
      durationMs: updated.durationMs,
      videoStartUnixMs: updated.videoStartUnixMs,
      fileSizeBytes: updated.fileSizeBytes,
      format: updated.format!,
      createdAt: updated.createdAt!.toISOString(),
    });
  });

  // DELETE /api/v1/recordings/:id
  app.delete('/recordings/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Delete a recording',
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
      .delete(recordings)
      .where(eq(recordings.id, id))
      .returning({ id: recordings.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    // TODO Phase 3: delete the file from storage backend

    return reply.status(204).send();
  });
}
