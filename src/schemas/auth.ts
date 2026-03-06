import { Type, Static } from '@sinclair/typebox';

export const RegisterBody = Type.Object({
  username: Type.String({ minLength: 3, maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  inviteToken: Type.Optional(Type.String()),
});
export type RegisterBody = Static<typeof RegisterBody>;

export const LoginBody = Type.Object({
  username: Type.String(),
  password: Type.String(),
});
export type LoginBody = Static<typeof LoginBody>;

export const UserResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  displayName: Type.String(),
  role: Type.String(),
});
export type UserResponse = Static<typeof UserResponse>;

export const AuthResponse = Type.Object({
  token: Type.String(),
  user: UserResponse,
});
export type AuthResponse = Static<typeof AuthResponse>;
