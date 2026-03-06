import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { recordings } from '../db/schema.js';
import { RecordingMetadata, UploadUrlResponse, RecordingResponse } from '../schemas/recordings.js';
import { UuidParam, ErrorResponse } from '../schemas/common.js';
import { getStorage } from '../services/storage/index.js';

const UPLOAD_EXPIRES_SEC = 2 * 60 * 60; // 2 hours
const DOWNLOAD_EXPIRES_SEC = 60 * 60; // 1 hour
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

export const recordingRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const storage = await getStorage();

  // Accept raw binary bodies for the upload endpoint
  app.addContentTypeParser(
    ['application/octet-stream', 'video/mp4', 'video/webm'],
    (_req, payload, done) => { done(null, payload); },
  );

  // POST /api/v1/recordings/upload-url
  app.post('/recordings/upload-url', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Request an upload URL for a new recording',
      description:
        'The client calls this before uploading a video. ' +
        'Returns a recordingId and a URL to PUT the video file to. ' +
        'For S3 storage the URL points directly to S3 (presigned). ' +
        'For local storage the URL points to this API.',
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

    const presignedUrl = await storage.generateUploadUrl(storageKey, 'video/mp4', UPLOAD_EXPIRES_SEC);
    const uploadUrl = presignedUrl ?? `/api/v1/recordings/${recordingId}/upload`;
    const expiresAt = new Date(Date.now() + UPLOAD_EXPIRES_SEC * 1000);

    return reply.status(201).send({
      recordingId,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
    });
  });

  // PUT /api/v1/recordings/:id/upload — receive the video file (local storage)
  app.put('/recordings/:id/upload', {
    onRequest: [app.authenticate],
    bodyLimit: MAX_UPLOAD_BYTES,
    schema: {
      tags: ['recordings'],
      summary: 'Upload video file',
      description:
        'PUT the raw video bytes here. Only used when storage backend is local disk. ' +
        'For S3, the client uploads directly to the presigned URL.',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
        200: RecordingResponse,
        404: ErrorResponse,
        409: ErrorResponse,
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

    if (rec.status !== 'uploading') {
      return reply.status(409).send({ error: `Recording status is '${rec.status}', expected 'uploading'` });
    }

    const { size } = await storage.put(rec.storageKey, request.raw);

    const [updated] = await db
      .update(recordings)
      .set({ status: 'ready', fileSizeBytes: size })
      .where(eq(recordings.id, id))
      .returning();

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

  // GET /api/v1/recordings/:id/stream — serve the video file
  app.get('/recordings/:id/stream', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['recordings'],
      summary: 'Stream video file',
      description:
        'For local storage, streams the file directly. ' +
        'For S3 storage, redirects to a presigned download URL.',
      security: [{ bearerAuth: [] }],
      params: UuidParam,
      response: {
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

    // S3: redirect to a presigned download URL
    const presignedUrl = await storage.generateDownloadUrl(rec.storageKey, DOWNLOAD_EXPIRES_SEC);
    if (presignedUrl) {
      return reply.redirect(presignedUrl);
    }

    // Local: stream the file
    const { stream, size } = await storage.get(rec.storageKey);
    void reply.header('Content-Type', 'video/mp4');
    if (size) void reply.header('Content-Length', size);
    return reply.send(stream as any);
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

  // PATCH /api/v1/recordings/:id/status
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
      .returning({ id: recordings.id, storageKey: recordings.storageKey });

    if (!deleted) {
      return reply.status(404).send({ error: 'Recording not found' });
    }

    await storage.delete(deleted.storageKey);

    return reply.status(204).send(null);
  });
}
