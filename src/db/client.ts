import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Lazy singleton — the connection is not established until the first query.
// config.ts validates DATABASE_URL on startup so the non-null assertion is safe.
const sql = postgres(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
