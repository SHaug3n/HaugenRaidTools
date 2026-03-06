import { Type, Static } from '@sinclair/typebox';

export const CreateFightBody = Type.Object({
  sessionId: Type.String({ format: 'uuid' }),
  encounterId: Type.Number(),
  encounterName: Type.String({ minLength: 1, maxLength: 128 }),
  difficultyId: Type.Number(),
  pullNumber: Type.Number({ minimum: 1 }),
  kill: Type.Boolean(),
  bossPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  durationMs: Type.Number({ minimum: 0 }),
  fightStartUnixMs: Type.Number(),
  fightEndUnixMs: Type.Number(),
});
export type CreateFightBody = Static<typeof CreateFightBody>;

export const FightResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  sessionId: Type.String({ format: 'uuid' }),
  encounterId: Type.Number(),
  encounterName: Type.String(),
  difficultyId: Type.Number(),
  pullNumber: Type.Number(),
  kill: Type.Boolean(),
  bossPct: Type.Union([Type.Number(), Type.Null()]),
  durationMs: Type.Number(),
  fightStartUnixMs: Type.Number(),
  fightEndUnixMs: Type.Number(),
  wclFightId: Type.Union([Type.Number(), Type.Null()]),
  recordingCount: Type.Number(),
  createdAt: Type.String({ format: 'date-time' }),
});
export type FightResponse = Static<typeof FightResponse>;

export const FightListResponse = Type.Object({
  fights: Type.Array(FightResponse),
  total: Type.Number(),
});
export type FightListResponse = Static<typeof FightListResponse>;
