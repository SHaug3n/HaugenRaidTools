import { Type, Static } from '@sinclair/typebox';

export const CreateSessionBody = Type.Object({
  instanceName: Type.String({ minLength: 1, maxLength: 128 }),
  date: Type.String({ format: 'date' }),
  wclReportCode: Type.Optional(Type.String({ maxLength: 32 })),
});
export type CreateSessionBody = Static<typeof CreateSessionBody>;

export const UpdateSessionBody = Type.Partial(CreateSessionBody);
export type UpdateSessionBody = Static<typeof UpdateSessionBody>;

export const FightSummary = Type.Object({
  id: Type.String({ format: 'uuid' }),
  encounterName: Type.String(),
  pullNumber: Type.Number(),
  kill: Type.Boolean(),
  bossPct: Type.Union([Type.Number(), Type.Null()]),
  durationMs: Type.Number(),
  recordingCount: Type.Number(),
});
export type FightSummary = Static<typeof FightSummary>;

export const SessionResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  teamId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  instanceName: Type.String(),
  date: Type.String(),
  wclReportCode: Type.Union([Type.String(), Type.Null()]),
  fights: Type.Array(FightSummary),
  createdAt: Type.String({ format: 'date-time' }),
});
export type SessionResponse = Static<typeof SessionResponse>;

export const SessionListResponse = Type.Object({
  sessions: Type.Array(Type.Omit(SessionResponse, ['fights'])),
  total: Type.Number(),
});
export type SessionListResponse = Static<typeof SessionListResponse>;
