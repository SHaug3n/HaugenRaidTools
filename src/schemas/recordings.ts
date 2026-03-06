import { Type, Static } from '@sinclair/typebox';

export const RecordingStatus = Type.Union([
  Type.Literal('uploading'),
  Type.Literal('processing'),
  Type.Literal('ready'),
  Type.Literal('error'),
]);
export type RecordingStatus = Static<typeof RecordingStatus>;

export const RecordingMetadata = Type.Object({
  fightId: Type.String({ format: 'uuid' }),
  encounterID: Type.Number(),
  encounterName: Type.String(),
  difficultyID: Type.Number(),
  groupSize: Type.Number({ minimum: 1, maximum: 40 }),
  kill: Type.Boolean(),
  bossPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  durationMs: Type.Number({ minimum: 0 }),
  videoStartUnixMs: Type.Number(),
  pullNumber: Type.Number({ minimum: 1 }),
});
export type RecordingMetadata = Static<typeof RecordingMetadata>;

export const UploadUrlResponse = Type.Object({
  recordingId: Type.String({ format: 'uuid' }),
  uploadUrl: Type.String({ format: 'uri' }),
  expiresAt: Type.String({ format: 'date-time' }),
});
export type UploadUrlResponse = Static<typeof UploadUrlResponse>;

export const RecordingResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  fightId: Type.String({ format: 'uuid' }),
  userId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  status: RecordingStatus,
  durationMs: Type.Number(),
  videoStartUnixMs: Type.Number(),
  fileSizeBytes: Type.Union([Type.Number(), Type.Null()]),
  format: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
});
export type RecordingResponse = Static<typeof RecordingResponse>;
