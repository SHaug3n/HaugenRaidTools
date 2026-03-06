import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),

  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),

  storageBackend: optional('STORAGE_BACKEND', 'local') as 'local' | 's3',
  storageLocalPath: optional('STORAGE_LOCAL_PATH', './data/videos'),

  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3001'),

  wclClientId: process.env.WCL_CLIENT_ID,
  wclClientSecret: process.env.WCL_CLIENT_SECRET,
} as const;
