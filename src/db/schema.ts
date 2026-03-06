import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  smallint,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Auth & teams ────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  username: varchar('username', { length: 64 }).unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 128 }),
  role: varchar('role', { length: 16 }).default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 16 }).default('member'),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

export const inviteTokens = pgTable('invite_tokens', {
  token: varchar('token', { length: 64 }).primaryKey(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

// ─── Raid data ───────────────────────────────────────────────────────────────

export const raidSessions = pgTable(
  'raid_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    instanceName: varchar('instance_name', { length: 128 }).notNull(),
    date: date('date').notNull(),
    wclReportCode: varchar('wcl_report_code', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_sessions_team').on(table.teamId)],
);

export const fights = pgTable(
  'fights',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id').references(() => raidSessions.id, { onDelete: 'cascade' }),
    encounterId: integer('encounter_id').notNull(),
    encounterName: varchar('encounter_name', { length: 128 }).notNull(),
    difficultyId: integer('difficulty_id').notNull(),
    pullNumber: integer('pull_number').notNull(),
    kill: boolean('kill').notNull(),
    bossPct: smallint('boss_pct'),
    durationMs: integer('duration_ms').notNull(),
    fightStartUnixMs: bigint('fight_start_unix_ms', { mode: 'number' }).notNull(),
    fightEndUnixMs: bigint('fight_end_unix_ms', { mode: 'number' }).notNull(),
    wclFightId: integer('wcl_fight_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_fights_session').on(table.sessionId)],
);

// ─── Recordings ──────────────────────────────────────────────────────────────

export const recordings = pgTable(
  'recordings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fightId: uuid('fight_id').references(() => fights.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    storageKey: text('storage_key').notNull(),
    videoStartUnixMs: bigint('video_start_unix_ms', { mode: 'number' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    status: varchar('status', { length: 16 }).default('uploading'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    format: varchar('format', { length: 16 }).default('compressed'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_recordings_fight').on(table.fightId)],
);

// ─── WCL cache ───────────────────────────────────────────────────────────────

export const wclCache = pgTable(
  'wcl_cache',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    reportCode: varchar('report_code', { length: 32 }).notNull(),
    // null = report-level data; -1 sentinel not needed since we use a separate unique index
    fightId: integer('fight_id'),
    dataType: varchar('data_type', { length: 32 }).notNull(),
    data: jsonb('data').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('wcl_cache_unique').on(table.reportCode, table.fightId, table.dataType),
  ],
);

// ─── Timeline events ──────────────────────────────────────────────────────────

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fightId: uuid('fight_id').references(() => fights.id, { onDelete: 'cascade' }),
    timestampMs: integer('timestamp_ms').notNull(),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    label: text('label').notNull(),
    playerName: varchar('player_name', { length: 64 }),
    details: jsonb('details'),
  },
  (table) => [index('idx_timeline_fight').on(table.fightId)],
);

// ─── Type helpers ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type RaidSession = typeof raidSessions.$inferSelect;
export type Fight = typeof fights.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
