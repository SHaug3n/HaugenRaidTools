# HaugenRaidTools-Server

Self-hosted WoW raid recording and replay server. Part of the [Haugen Raid Tools](https://github.com/shaug3n/HaugenRaidTools-Server) project.

## What this is

The server half of Haugen Raid Tools: a Fastify API, a PostgreSQL database, and (later) a Next.js web dashboard — all shipped as a single Docker Compose stack. The Electron companion app (`Haugen Raid Tools-client`) records boss pulls locally and uploads them here.

## Development

### Prerequisites

- Node.js 22+
- Docker (for the local database)

### Setup

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET

# 2. Start PostgreSQL
docker compose -f docker/docker-compose.dev.yml up -d

# 3. Install dependencies
npm install

# 4. Push the schema to the DB (first time) or run migrations
npm run db:push

# 5. Start the dev server (hot-reload via tsx)
npm run dev
```

The API will be available at http://localhost:3000.
Swagger UI: http://localhost:3000/docs
Live OpenAPI spec: http://localhost:3000/api/openapi.yaml

### OpenAPI spec generation

```bash
npm run generate:spec
# Writes to api/spec/openapi.yaml
```

Commit the generated spec. The `Haugen Raid Tools-client` repo fetches it to generate typed API client code.

### Database

```bash
# Generate a new migration after changing src/db/schema.ts
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Interactive schema browser
npm run db:studio
```

## Project structure

```
src/
  app.ts            # Fastify app setup + plugin registration
  server.ts         # Entry point
  config.ts         # Env-based config validation
  schemas/          # TypeBox schema definitions (the source of truth)
  routes/           # Route handlers
  plugins/          # Fastify plugins (swagger, auth)
  services/         # Business logic (auth, storage, WCL)
  db/
    schema.ts       # Drizzle ORM table definitions
    client.ts       # DB connection singleton
    migrations/     # Auto-generated SQL migrations
scripts/
  generate-openapi.ts  # Writes api/spec/openapi.yaml
api/
  spec/
    openapi.yaml    # Auto-generated, committed to repo
docker/
  Dockerfile.api
  docker-compose.yml
  docker-compose.dev.yml
  Caddyfile
  .env.example
```

## Self-hosting

```bash
cd docker
cp .env.example .env
# Fill in DB_PASSWORD, JWT_SECRET, and your domain in Caddyfile

docker compose up -d
```

## Tech stack

| Component | Technology |
|-----------|-----------|
| API | Fastify + TypeBox |
| Database | PostgreSQL + Drizzle ORM |
| OpenAPI | @fastify/swagger (auto-generated from schemas) |
| Auth | JWT via @fastify/jwt |
| Reverse proxy | Caddy (auto-HTTPS) |
| Containers | Docker Compose |
