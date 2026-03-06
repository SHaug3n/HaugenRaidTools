import { Type } from '@sinclair/typebox';

export const UuidParam = Type.Object({
  id: Type.String({ format: 'uuid' }),
});

export const PaginationQuery = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Number({ minimum: 0, default: 0 })),
});

export const ErrorResponse = Type.Object({
  error: Type.String(),
});

export const MessageResponse = Type.Object({
  message: Type.String(),
});
