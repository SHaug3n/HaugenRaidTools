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

  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
  s3Bucket: process.env.S3_BUCKET ?? 'raidreplay',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3Region: process.env.S3_REGION ?? 'us-east-1',

  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3001'),

  wclClientId: process.env.WCL_CLIENT_ID,
  wclClientSecret: process.env.WCL_CLIENT_SECRET,
} as const;
