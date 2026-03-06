# RaidReplay Server

## What this is

Self-hostable backend for a WoW raid recording and replay tool. Guild leaders run this on their own server. Raiders install a separate companion desktop app that connects to this server.

## Repo structure

This repo contains two apps managed by Turborepo:

- `apps/api/` — Fastify API server (TypeBox schemas, PostgreSQL via Drizzle, pluggable storage)
- `apps/web/` — Next.js dashboard (static export, Video.js player, WCL timeline sync)
- `api/spec/openapi.yaml` — Auto-generated OpenAPI spec (THE CONTRACT between server and client)
- `docker/` — Docker Compose stack for self-hosting

There is a separate repo for the Electron companion app (`raidreplay-client`). It consumes the OpenAPI spec from this repo to generate a type-safe API client.

## Architecture decisions

- **OpenAPI contract-first**: TypeBox schemas → Fastify routes → `@fastify/swagger` auto-generates the OpenAPI spec. The client repo runs `openapi-typescript` against this spec to generate types. Never manually write shared types.
- **Storage is pluggable**: `StorageBackend` interface with `LocalDiskStorage` and `S3Storage` implementations. Configured via `STORAGE_BACKEND` env var.
- **WCL is optional**: The tool must work without WarcraftLogs credentials. Combat log data provides encounter names, kill/wipe, duration. WCL adds timeline events (deaths, phases, damage) but doesn't gate core functionality.
- **Web dashboard is a static export**: `output: 'export'` in Next.js. Served by Caddy. No Node.js runtime on the server for the frontend.
- **Auth is local-first**: Username/password + JWT + invite tokens. Battle.net OAuth and WCL OAuth are optional enhancements the admin can enable.

## Tech stack

- **API**: Fastify + TypeBox + @fastify/swagger
- **DB**: PostgreSQL + Drizzle ORM
- **Web**: Next.js (static) + Video.js + videojs-markers + hls.js
- **API client (web)**: openapi-typescript + openapi-fetch (generated from spec)
- **Storage**: Local disk or S3-compatible (MinIO, R2, AWS)
- **Reverse proxy**: Caddy (auto-HTTPS)
- **Deploy**: Docker Compose

## Key commands

```bash
npm run dev              # Start API + web in dev mode (turborepo)
npm run generate:spec    # Regenerate openapi.yaml from route schemas
npm run db:migrate       # Run Drizzle migrations
npm run db:seed          # Seed dev data
npm run build            # Build API + web + generate spec
npm run typecheck        # Type check all packages
```

## Important patterns

### Adding a new API endpoint

1. Define TypeBox schema in `apps/api/src/schemas/`
2. Create route in `apps/api/src/routes/` using the schema
3. Run `npm run generate:spec` to update `api/spec/openapi.yaml`
4. Commit the updated spec — it must always be in sync
5. The web dashboard picks up the new types automatically (same repo)
6. The client repo will pick them up on their next `npm run api:update`

### Storage backend

Always go through the `StorageBackend` interface in `apps/api/src/services/storage/interface.ts`. Never write directly to the filesystem or call S3 directly from route handlers.

### WCL sync math

```
videoTimeSeconds = ((wclReportStartMs + wclFightStartMs + eventOffsetMs) - videoStartUnixMs) / 1000
```

All timestamps are UNIX milliseconds. WCL report.startTime is absolute, fight events are offsets from report start, video start is recorded by the companion app at ENCOUNTER_START.

## API versioning

Routes are prefixed with `/api/v1/`. The `/api/health` endpoint reports server version, API version, and minimum compatible client version. Breaking changes require a version bump and are detected in CI via `openapi-diff`.

## Environment variables

See `docker/.env.example` for all configuration options. Key ones:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWTs
- `STORAGE_BACKEND` — `local` or `s3`
- `STORAGE_LOCAL_PATH` — Path for local storage (default: `/data/videos`)
- `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET` — Optional WarcraftLogs API credentials
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — For S3 storage
