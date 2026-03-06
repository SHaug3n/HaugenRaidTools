import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { RegisterBody, LoginBody, AuthResponse, UserResponse } from '../schemas/auth.js';
import { ErrorResponse } from '../schemas/common.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  hashPassword,
  verifyPassword,
  findUserByUsername,
  isFirstUser,
  validateInviteToken,
  consumeInviteToken,
} from '../services/auth.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/register', {
    schema: {
      tags: ['auth'],
      summary: 'Register a new user',
      description:
        'The first registered user is automatically granted the admin role. ' +
        'Subsequent registrations require a valid invite token.',
      body: RegisterBody,
      response: {
        201: AuthResponse,
        400: ErrorResponse,
        409: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { username, password, displayName, inviteToken } = request.body;

    const first = await isFirstUser();

    // Require invite token if not the first user
    if (!first) {
      if (!inviteToken) {
        return reply.status(400).send({ error: 'An invite token is required to register' });
      }
      const invite = await validateInviteToken(inviteToken);
      if (!invite) {
        return reply.status(400).send({ error: 'Invalid or expired invite token' });
      }
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return reply.status(409).send({ error: 'Username already taken' });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName: displayName ?? username,
        role: first ? 'admin' : 'member',
      })
      .returning();

    if (!first && inviteToken) {
      await consumeInviteToken(inviteToken, user.id);
    }

    const token = app.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role!,
    });

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? user.username,
        role: user.role!,
      },
    });
  });

  // POST /api/auth/login
  app.post('/login', {
    schema: {
      tags: ['auth'],
      summary: 'Login with username and password',
      body: LoginBody,
      response: {
        200: AuthResponse,
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    const user = await findUserByUsername(username);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role!,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? user.username,
        role: user.role!,
      },
    });
  });

  // GET /api/auth/me — returns the authenticated user
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }],
      response: {
        200: UserResponse,
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const { sub } = request.user;
    const [user] = await db.select().from(users).where(
      (await import('drizzle-orm')).eq(users.id, sub),
    ).limit(1);

    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    return reply.send({
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
      role: user.role!,
    });
  });
}
