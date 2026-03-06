import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { users, inviteTokens } from '../db/schema.js';
import { eq, gt, and, isNull } from 'drizzle-orm';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function findUserByUsername(username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function isFirstUser(): Promise<boolean> {
  const [row] = await db.select().from(users).limit(1);
  return !row;
}

export async function validateInviteToken(token: string) {
  const now = new Date();
  const [invite] = await db
    .select()
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.token, token),
        isNull(inviteTokens.usedBy),
        gt(inviteTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return invite ?? null;
}

export async function consumeInviteToken(token: string, userId: string) {
  await db
    .update(inviteTokens)
    .set({ usedBy: userId, usedAt: new Date() })
    .where(eq(inviteTokens.token, token));
}
