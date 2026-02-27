# RaidReplay — Architecture Plan v2
## Split Repos + OpenAPI Contract

---

## Repository Structure

```
GitHub:
  raidreplay/
  ├── raidreplay-server      # API + web dashboard + Docker distribution
  ├── raidreplay-client      # Electron companion app (desktop recorder)
  └── raidreplay-docs        # Project docs, website, install guides (optional, later)
```

Two repos. No shared types package. No git submodules. The **OpenAPI spec is the contract** — it lives in the server repo, is auto-generated from the server's route schemas, and the client repo consumes it to generate a fully typed API client. The web dashboard lives in the server repo because it ships inside the same Docker stack.

---

## Why This Split

| Concern | Monorepo | Split repos |
|---------|----------|-------------|
| Release cycles | Coupled — one tag for everything | Independent — server v1.3 can work with client v1.1 |
| CI/CD | Builds everything on every push | Client CI builds Electron installers; Server CI builds Docker images |
| Contributors | Must clone full project | Fix a client bug without touching server code |
| Packaging | electron-builder + Docker in same pipeline | Each repo has focused, simple CI |
| Type safety | Compile-time via imports | Compile-time via generated types from OpenAPI spec |
| API versioning | Implicit (same codebase) | Explicit (spec version, breaking change detection) |

The split forces you to think about the API as a **stable, versioned contract** from day one. This is critical for a self-hosted product where server and client versions will inevitably drift — a guild running server v1.2 might have raiders still on client v1.0. The OpenAPI spec makes compatibility explicit.

---

## The OpenAPI Contract Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  raidreplay-server                                              │
│                                                                 │
│  TypeBox schemas ──► Fastify routes ──► @fastify/swagger        │
│                                              │                  │
│                                              ▼                  │
│                                    openapi.yaml (auto-generated)│
│                                              │                  │
│                                              ▼                  │
│                              Published as GitHub Release asset  │
│                              + committed to repo at /api/spec/  │
│                              + served at GET /api/openapi.yaml  │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│  raidreplay-server/web   │    │  raidreplay-client            │
│                          │    │                               │
│  openapi-typescript      │    │  openapi-typescript           │
│  + openapi-fetch         │    │  + openapi-fetch              │
│       ▼                  │    │       ▼                       │
│  Type-safe API calls     │    │  Type-safe API calls          │
│  in the web dashboard    │    │  in the Electron app          │
└──────────────────────────┘    └──────────────────────────────┘
```

### Step by step

**1. Server defines schemas with TypeBox**

TypeBox gives you TypeScript types, JSON Schema validation, and OpenAPI schema generation from a single definition. Fastify natively understands TypeBox schemas for request validation.

```typescript
// server/src/schemas/recordings.ts
import { Type, Static } from '@sinclair/typebox';

export const RecordingMetadata = Type.Object({
  encounterID: Type.Number(),
  encounterName: Type.String(),
  difficultyID: Type.Number(),
  groupSize: Type.Number(),
  kill: Type.Boolean(),
  bossPct: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  durationMs: Type.Number(),
  videoStartUnixMs: Type.Number(),
  pullNumber: Type.Number(),
});
export type RecordingMetadata = Static<typeof RecordingMetadata>;

export const UploadUrlResponse = Type.Object({
  recordingId: Type.String({ format: 'uuid' }),
  uploadUrl: Type.String({ format: 'uri' }),
  expiresAt: Type.String({ format: 'date-time' }),
});
export type UploadUrlResponse = Static<typeof UploadUrlResponse>;

export const RecordingStatus = Type.Union([
  Type.Literal('uploading'),
  Type.Literal('processing'),
  Type.Literal('ready'),
  Type.Literal('error'),
]);
```

**2. Fastify routes use the schemas, `@fastify/swagger` generates the spec**

```typescript
// server/src/routes/recordings.ts
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { RecordingMetadata, UploadUrlResponse } from '../schemas/recordings.js';

export async function recordingRoutes(app: FastifyInstance) {
  app.post('/api/recordings/upload-url', {
    schema: {
      tags: ['recordings'],
      summary: 'Request a presigned upload URL for a new recording',
      body: RecordingMetadata,
      response: {
        201: UploadUrlResponse,
        401: Type.Object({ error: Type.String() }),
      },
    },
  }, async (request, reply) => {
    // request.body is fully typed as RecordingMetadata
    // Fastify validates the body at runtime against the schema
    const metadata = request.body;
    // ... create recording record, generate upload URL
    return reply.status(201).send({ recordingId, uploadUrl, expiresAt });
  });
}
```

**3. Spec generation script exports `openapi.yaml`**

```typescript
// server/scripts/generate-openapi.ts
import { setupApp } from '../src/app.js';
import yaml from 'yaml';
import fs from 'node:fs/promises';

const app = await setupApp();
await app.ready();

const spec = app.swagger();  // returns the full OpenAPI object
const yamlStr = yaml.stringify(spec);

await fs.writeFile('./api/spec/openapi.yaml', yamlStr);
console.log(`OpenAPI spec generated: v${spec.info.version}`);

await app.close();
```

```jsonc
// server/package.json
{
  "scripts": {
    "generate:spec": "tsx scripts/generate-openapi.ts",
    "build": "tsc && npm run generate:spec"
  }
}
```

The spec is committed to the repo at `api/spec/openapi.yaml` and also served at runtime via `GET /api/openapi.yaml` for live consumption. This means the client can always fetch the latest spec from a running server instance.

**4. Client repo consumes the spec and generates types**

```jsonc
// client/package.json
{
  "scripts": {
    "fetch:spec": "curl -o ./src/api/openapi.yaml https://raw.githubusercontent.com/yourorg/raidreplay-server/main/api/spec/openapi.yaml",
    "generate:api": "openapi-typescript ./src/api/openapi.yaml -o ./src/api/schema.d.ts",
    "api:update": "npm run fetch:spec && npm run generate:api"
  },
  "devDependencies": {
    "openapi-typescript": "^7.0.0",
    "openapi-fetch": "^0.12.0"
  }
}
```

**5. Client uses the generated types for fully typed API calls**

```typescript
// client/src/api/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './schema.js';  // auto-generated from spec

export function createApiClient(serverUrl: string, token: string) {
  return createClient<paths>({
    baseUrl: serverUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// Usage — fully typed, zero manual type definitions
const client = createApiClient('https://raidreplay.yourguild.com', token);

const { data, error } = await client.POST('/api/recordings/upload-url', {
  body: {
    encounterID: 2902,
    encounterName: 'Broodtwister Ovi\'nax',
    difficultyID: 16,
    groupSize: 20,
    kill: false,
    bossPct: 35,
    durationMs: 261336,
    videoStartUnixMs: Date.now(),
    pullNumber: 7,
  },
});

if (data) {
  // data is typed as { recordingId: string; uploadUrl: string; expiresAt: string }
  console.log(`Upload to: ${data.uploadUrl}`);
}
```

The `openapi-fetch` library provides **zero runtime overhead** — it's just `fetch()` with types layered on at compile time. No generated classes, no heavy SDK. The `paths` type maps every route, method, request body, and response shape.

---

## Versioning & Compatibility Strategy

This is the most important part of the split-repo approach. Since self-hosters control when they update the server, and raiders control when they update the client, **version mismatches are inevitable**.

### API versioning via URL prefix

```
/api/v1/recordings/upload-url    ← current
/api/v2/recordings/upload-url    ← future breaking change
```

The server supports multiple API versions simultaneously. Old versions are maintained for at least 2 minor server releases. The client stores the API version it was built against and sends it in requests.

### Compatibility header

The server responds to every request with:
```
X-RaidReplay-API-Version: 1.3.0
X-RaidReplay-Min-Client: 1.0.0
```

The client checks this on startup (via `GET /api/health`) and warns the user if their client is too old. The server can reject requests from clients below the minimum version.

### Health/discovery endpoint

```typescript
// GET /api/health — no auth required
{
  "status": "ok",
  "version": "1.3.0",           // server version
  "apiVersion": "1",             // current API version
  "minClientVersion": "1.0.0",   // minimum compatible client
  "features": {
    "wcl": true,                  // WCL integration configured
    "serverTranscoding": false,   // transcoding worker not running
    "s3Storage": false            // using local disk
  },
  "specUrl": "/api/openapi.yaml"
}
```

The client uses this to adapt its behavior: if `serverTranscoding` is false, it knows to compress locally. If `wcl` is false, it hides WCL-related UI.

### Breaking change detection in CI

Use `openapi-diff` or Optic in the server CI to detect breaking changes in the spec. If a PR introduces a breaking change, CI flags it and requires a version bump.

```yaml
# server/.github/workflows/api-check.yml
- name: Check for breaking API changes
  run: |
    npx openapi-diff api/spec/openapi.yaml api/spec/openapi.yaml.prev
    # Fails if breaking changes detected without version bump
```

---

## Server Repo Structure

```
raidreplay-server/
├── api/
│   └── spec/
│       └── openapi.yaml          # Auto-generated, committed to repo
├── src/
│   ├── app.ts                    # Fastify app setup + plugin registration
│   ├── server.ts                 # Entry point (listen)
│   ├── config.ts                 # Env-based config with validation
│   ├── routes/
│   │   ├── auth.ts               # Login, register, invite tokens
│   │   ├── recordings.ts         # Upload URLs, CRUD, metadata
│   │   ├── sessions.ts           # Raid sessions
│   │   ├── fights.ts             # Individual boss fights
│   │   ├── wcl.ts                # WarcraftLogs proxy + sync
│   │   ├── teams.ts              # Team/guild management
│   │   ├── admin.ts              # Server administration
│   │   └── health.ts             # Health + discovery
│   ├── schemas/                  # TypeBox schema definitions
│   │   ├── auth.ts
│   │   ├── recordings.ts
│   │   ├── sessions.ts
│   │   ├── fights.ts
│   │   ├── wcl.ts
│   │   ├── teams.ts
│   │   └── common.ts             # Shared types (pagination, errors)
│   ├── services/
│   │   ├── storage/
│   │   │   ├── interface.ts      # StorageBackend interface
│   │   │   ├── local.ts          # LocalDiskStorage
│   │   │   └── s3.ts             # S3Storage (MinIO, R2, AWS)
│   │   ├── wcl/
│   │   │   ├── client.ts         # WCL GraphQL client
│   │   │   ├── cache.ts          # Response caching
│   │   │   └── sync.ts           # Timestamp sync engine
│   │   ├── auth.ts               # JWT, password hashing
│   │   └── retention.ts          # Auto-cleanup
│   ├── db/
│   │   ├── schema.ts             # Drizzle ORM schema
│   │   ├── client.ts             # DB connection
│   │   └── migrations/
│   └── plugins/
│       ├── swagger.ts            # @fastify/swagger config
│       └── auth.ts               # Auth hook/decorator
├── web/                          # Next.js dashboard (static export)
│   ├── src/
│   │   ├── app/                  # App router pages
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── sessions/
│   │   │   ├── fights/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx   # Video.js + markers
│   │   │   ├── Timeline.tsx      # WCL event timeline
│   │   │   ├── PovSwitcher.tsx   # Multi-POV selector
│   │   │   └── FightList.tsx     # Session sidebar
│   │   ├── api/
│   │   │   ├── schema.d.ts      # Generated from openapi.yaml
│   │   │   └── client.ts        # openapi-fetch configured client
│   │   └── lib/
│   │       └── wcl-sync.ts      # Client-side timestamp math
│   ├── next.config.ts            # output: 'export' for static
│   └── package.json
├── scripts/
│   ├── generate-openapi.ts       # Spec generation
│   └── seed.ts                   # Dev seed data
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── Caddyfile
│   └── .env.example
├── package.json
├── turbo.json                    # Manages api + web within server repo
└── README.md
```

The server repo uses **Turborepo internally** to manage the API and web dashboard as two packages within one repo. This makes sense because they share the same deploy lifecycle (both go in the Docker stack) and the web dashboard directly imports the generated spec from `api/spec/openapi.yaml` at build time.

---

## Client Repo Structure

```
raidreplay-client/
├── src/
│   ├── main/                     # Electron main process
│   │   ├── combatlog/
│   │   │   ├── tailer.ts         # Tails WoWCombatLog.txt
│   │   │   ├── parser.ts         # Parses ENCOUNTER_START/END
│   │   │   └── events.ts         # Event types + emitter
│   │   ├── recording/
│   │   │   ├── obs-controller.ts # OBS websocket control
│   │   │   ├── recorder.ts       # Recording state machine
│   │   │   └── metadata.ts       # Per-fight metadata
│   │   ├── upload/
│   │   │   ├── compressor.ts     # FFmpeg compression
│   │   │   ├── uploader.ts       # Upload to server
│   │   │   └── queue.ts          # Persistent upload queue
│   │   ├── server/
│   │   │   ├── connection.ts     # Server discovery + version check
│   │   │   └── auth.ts           # Token management
│   │   └── config.ts             # Settings (electron-store)
│   ├── renderer/                 # Electron renderer (React)
│   │   ├── pages/
│   │   │   ├── Setup.tsx         # First-run wizard
│   │   │   ├── Dashboard.tsx     # Local recordings + upload status
│   │   │   ├── Recording.tsx     # Live recording indicator
│   │   │   └── Settings.tsx      # Server URL, OBS config, WoW path
│   │   └── components/
│   ├── api/
│   │   ├── openapi.yaml          # Fetched from server repo
│   │   ├── schema.d.ts           # Generated types
│   │   └── client.ts             # openapi-fetch wrapper
│   └── preload.ts
├── resources/
│   └── ffmpeg/                   # Bundled FFmpeg (per-platform)
├── scripts/
│   └── fetch-spec.sh             # Downloads latest openapi.yaml
├── electron-builder.yml
├── package.json
└── README.md
```

---

## Spec Synchronization Workflow

### During development (you, right now)

```bash
# In server repo: make API changes, regenerate spec
cd raidreplay-server
npm run generate:spec
git add api/spec/openapi.yaml
git commit -m "feat: add recording upload endpoint"
git push

# In client repo: pull latest spec, regenerate types
cd raidreplay-client
npm run api:update    # fetches spec from GitHub, runs openapi-typescript
# Now your IDE shows updated types, compile errors for any mismatches
```

### In CI (automated)

**Server CI** (on push to main):
```yaml
# .github/workflows/build.yml
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run generate:spec
      - name: Verify spec is committed
        run: git diff --exit-code api/spec/openapi.yaml
      - name: Check for breaking changes
        run: npx @opticdev/optic diff api/spec/openapi.yaml --check
      - run: npm test
      - name: Build Docker images
        run: docker build -f docker/Dockerfile.api -t raidreplay-api .
```

**Client CI** (on push to main):
```yaml
# .github/workflows/build.yml
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run api:update      # fetch + generate
      - run: npm run typecheck        # catches any contract mismatches
      - run: npm run build            # electron-builder
      - name: Upload installers
        uses: actions/upload-artifact@v4
        with:
          path: dist/*.exe
```

### When you release

Server releases tag the spec version in the OpenAPI `info.version` field. The client's `fetch-spec.sh` can target a specific server release tag:

```bash
#!/bin/bash
# scripts/fetch-spec.sh
VERSION=${1:-"latest"}
if [ "$VERSION" = "latest" ]; then
  URL="https://raw.githubusercontent.com/yourorg/raidreplay-server/main/api/spec/openapi.yaml"
else
  URL="https://raw.githubusercontent.com/yourorg/raidreplay-server/v${VERSION}/api/spec/openapi.yaml"
fi
curl -fsSL "$URL" -o src/api/openapi.yaml
npx openapi-typescript src/api/openapi.yaml -o src/api/schema.d.ts
echo "API types generated from spec version: $VERSION"
```

---

## High-Level Architecture (unchanged, but clearer ownership)

```
┌───────────────────────────────────────────────────────────────┐
│  RAIDER'S PC                                                  │
│                                 ┌───────────────────────────┐ │
│  ┌──────────────┐              │  raidreplay-client         │ │
│  │  World of    │  CombatLog   │  (Electron)                │ │
│  │  Warcraft    │─────────────▶│                            │ │
│  └──────────────┘              │  • Combat log tailer       │ │
│                                │  • OBS websocket control   │ │
│  ┌──────────────┐              │  • FFmpeg compression      │ │
│  │  OBS Studio  │◀────────────▶│  • Upload queue            │ │
│  └──────────────┘  websocket   │  • Type-safe API client    │ │
│                                │    (generated from spec)   │ │
│                                └─────────────┬─────────────┘ │
└──────────────────────────────────────────────┼────────────────┘
                                               │ HTTPS
                                               ▼
┌───────────────────────────────────────────────────────────────┐
│  SELF-HOSTED SERVER  (raidreplay-server, Docker Compose)      │
│                                                               │
│  ┌───────────────────┐  ┌────────────────────────────────┐   │
│  │  Caddy             │  │  API (Fastify + TypeBox)        │  │
│  │  (reverse proxy,   │─▶│                                 │  │
│  │   auto-HTTPS)      │  │  • Auth (JWT, invite tokens)   │  │
│  │                     │  │  • Recording management        │  │
│  │  yourguild.com/    │  │  • WCL proxy + cache            │  │
│  │   → web            │  │  • Storage abstraction          │  │
│  │  yourguild.com/api │  │  • OpenAPI spec served live     │  │
│  │   → api            │  │                                 │  │
│  └───────────────────┘  └─────┬──────────────┬────────────┘  │
│                               │              │                │
│  ┌───────────────────┐  ┌─────┴────┐  ┌──────┴───────────┐  │
│  │  Web Dashboard     │  │PostgreSQL│  │  Storage          │  │
│  │  (Next.js static)  │  │          │  │  (local disk or   │  │
│  │                     │  └──────────┘  │   MinIO/S3)      │  │
│  │  • Video.js player │                 └──────────────────┘  │
│  │  • WCL timeline    │                                       │
│  │  • POV switcher    │  ┌──────────────────┐                │
│  │  • Type-safe API   │  │  Worker (optional)│                │
│  │    (same spec!)    │  │  FFmpeg transcode │                │
│  └───────────────────┘  └──────────────────┘                 │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Key API Design: TypeBox Schemas → OpenAPI → Generated Client

The beauty of this approach is **one source of truth with three outputs**:

```
TypeBox schema definition
    │
    ├──► TypeScript types (compile-time, server-side)
    │       Used in Fastify route handlers
    │
    ├──► JSON Schema (runtime)
    │       Used by Fastify for request/response validation
    │
    └──► OpenAPI specification (build-time)
            Used by openapi-typescript to generate client types
            Used by openapi-fetch to create type-safe API calls
            Used by Swagger UI for interactive API documentation
            Used by openapi-diff for breaking change detection
```

### Example: full round-trip for a new endpoint

**1. Define the schema (server)**
```typescript
// server/src/schemas/sessions.ts
export const CreateSessionBody = Type.Object({
  instanceName: Type.String(),
  date: Type.String({ format: 'date' }),
  wclReportCode: Type.Optional(Type.String()),
});

export const SessionResponse = Type.Object({
  id: Type.String({ format: 'uuid' }),
  instanceName: Type.String(),
  date: Type.String({ format: 'date' }),
  wclReportCode: Type.Union([Type.String(), Type.Null()]),
  fights: Type.Array(Type.Object({
    id: Type.String({ format: 'uuid' }),
    encounterName: Type.String(),
    pull: Type.Number(),
    kill: Type.Boolean(),
    durationMs: Type.Number(),
    recordingCount: Type.Number(),
  })),
  createdAt: Type.String({ format: 'date-time' }),
});
```

**2. Use in route (server)**
```typescript
app.post('/api/v1/sessions', {
  schema: {
    tags: ['sessions'],
    body: CreateSessionBody,
    response: { 201: SessionResponse },
  },
}, async (req, reply) => { /* ... */ });
```

**3. Run `npm run generate:spec` → updates openapi.yaml automatically**

**4. Client pulls spec, regenerates types**
```bash
npm run api:update
```

**5. Client uses the new endpoint with full type safety**
```typescript
const { data } = await client.POST('/api/v1/sessions', {
  body: {
    instanceName: 'Nerub-ar Palace',
    date: '2025-03-15',
    wclReportCode: 'abc123',
  },
});
// data.fights[0].encounterName is typed as string
// data.fights[0].kill is typed as boolean
// Mistyping 'instanceName' as 'instance_name' → compile error
```

---

## Docker Compose (same as before, lives in server repo)

```yaml
# docker/docker-compose.yml
services:
  api:
    image: ghcr.io/yourorg/raidreplay-api:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://raidreplay:${DB_PASSWORD}@db:5432/raidreplay
      STORAGE_BACKEND: local
      STORAGE_LOCAL_PATH: /data/videos
      JWT_SECRET: ${JWT_SECRET}
      WCL_CLIENT_ID: ${WCL_CLIENT_ID:-}
      WCL_CLIENT_SECRET: ${WCL_CLIENT_SECRET:-}
    volumes:
      - video-data:/data/videos
    depends_on:
      - db

  web:
    image: ghcr.io/yourorg/raidreplay-web:latest
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: raidreplay
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: raidreplay
    volumes:
      - db-data:/var/lib/postgresql/data

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data

  # Optional: S3-compatible storage
  minio:
    image: minio/minio
    profiles: ["s3"]
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes:
      - minio-data:/data

  # Optional: server-side transcoding
  worker:
    image: ghcr.io/yourorg/raidreplay-worker:latest
    profiles: ["worker"]
    environment:
      DATABASE_URL: postgres://raidreplay:${DB_PASSWORD}@db:5432/raidreplay
      STORAGE_BACKEND: ${STORAGE_BACKEND:-local}
      STORAGE_LOCAL_PATH: /data/videos
    volumes:
      - video-data:/data/videos

volumes:
  video-data:
  db-data:
  caddy-data:
  minio-data:
```

---

## Database Schema

```sql
-- Auth & teams
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(128),
    role        VARCHAR(16) DEFAULT 'member',  -- admin | member
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(128) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_members (
    team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(16) DEFAULT 'member',  -- admin | member
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE invite_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_by  UUID REFERENCES users(id),
    expires_at  TIMESTAMPTZ,
    used_by     UUID REFERENCES users(id),
    used_at     TIMESTAMPTZ
);

-- Raid data
CREATE TABLE raid_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,
    instance_name   VARCHAR(128) NOT NULL,
    date            DATE NOT NULL,
    wcl_report_code VARCHAR(32),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID REFERENCES raid_sessions(id) ON DELETE CASCADE,
    encounter_id        INTEGER NOT NULL,
    encounter_name      VARCHAR(128) NOT NULL,
    difficulty_id       INTEGER NOT NULL,
    pull_number         INTEGER NOT NULL,
    kill                BOOLEAN NOT NULL,
    boss_pct            SMALLINT,       -- HP% at wipe (null if kill)
    duration_ms         INTEGER NOT NULL,
    fight_start_unix_ms BIGINT NOT NULL,
    fight_end_unix_ms   BIGINT NOT NULL,
    wcl_fight_id        INTEGER,        -- WCL fight ID for sync
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- Recordings
CREATE TABLE recordings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fight_id            UUID REFERENCES fights(id) ON DELETE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    storage_key         TEXT NOT NULL,   -- path in storage backend
    video_start_unix_ms BIGINT NOT NULL, -- for WCL sync
    duration_ms         INTEGER NOT NULL,
    status              VARCHAR(16) DEFAULT 'uploading',
    file_size_bytes     BIGINT,
    format              VARCHAR(16) DEFAULT 'compressed',
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- WCL cache (immutable for completed reports)
CREATE TABLE wcl_cache (
    report_code VARCHAR(32) NOT NULL,
    fight_id    INTEGER,                -- null = report-level data
    data_type   VARCHAR(32) NOT NULL,   -- 'fights' | 'deaths' | 'damage' | etc.
    data        JSONB NOT NULL,
    fetched_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (report_code, COALESCE(fight_id, -1), data_type)
);

-- Timeline events (materialized from WCL + combat log)
CREATE TABLE timeline_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fight_id        UUID REFERENCES fights(id) ON DELETE CASCADE,
    timestamp_ms    INTEGER NOT NULL,   -- offset from fight start
    event_type      VARCHAR(32) NOT NULL,
    label           TEXT NOT NULL,
    player_name     VARCHAR(64),
    details         JSONB
);

-- Indexes
CREATE INDEX idx_recordings_fight ON recordings(fight_id);
CREATE INDEX idx_fights_session ON fights(session_id);
CREATE INDEX idx_sessions_team ON raid_sessions(team_id);
CREATE INDEX idx_timeline_fight ON timeline_events(fight_id);
```

---

## POC Build Order (revised for split repos)

### Phase 1: Server skeleton + spec generation (week 1)
- Initialize `raidreplay-server` repo
- Fastify + TypeBox + `@fastify/swagger` setup
- Define core schemas: auth, recordings, sessions, fights, health
- Spec generation script producing `openapi.yaml`
- Docker Compose with PostgreSQL + API + Caddy
- Basic auth (register/login, JWT)
- **Deliverable**: Running API server with Swagger UI at `/docs`, exportable spec

### Phase 2: Recording client (weeks 2–4)
- Initialize `raidreplay-client` repo
- Fetch spec from server repo, generate types
- Electron app: combat log tailer, OBS websocket control
- Local recording management (structured file storage)
- Basic React UI: setup wizard, recording list, live status
- **Deliverable**: App that auto-records boss pulls locally

### Phase 3: Upload pipeline (weeks 5–6)
- Server: storage backend interface, local disk implementation
- Server: upload URL generation, recording CRUD endpoints
- Client: FFmpeg compression, upload queue with retry/resume
- Client: server connection setup (URL + auth)
- **Deliverable**: Raiders' recordings flow to the server automatically

### Phase 4: Web dashboard (weeks 7–9)
- Next.js static app inside server repo
- Generate API client from same spec (openapi-fetch)
- Browse sessions → fights → recordings
- Video.js player with basic playback
- POV selector for multi-raider fights
- **Deliverable**: Watch any raider's POV in a browser

### Phase 5: WCL timeline sync (weeks 10–12)
- Server: WCL OAuth + GraphQL client with caching
- Server: sync engine mapping WCL timestamps to video time
- Server: timeline events endpoint
- Web: videojs-markers integration, event sidebar
- Web: click-to-seek from WCL events
- **Deliverable**: Click "Tank died at 2:47" → video jumps there

### Phase 6: Self-hosting polish (weeks 13–16)
- First-run setup wizard
- Docker image publishing to GHCR
- Client auto-update via GitHub Releases
- Retention policies + storage management
- Install documentation
- Breaking change detection in CI
- **Deliverable**: Another guild can self-host from the README

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| **API** | Fastify + TypeBox | Native schema validation → OpenAPI generation |
| **Database** | PostgreSQL + Drizzle ORM | Reliable, type-safe, great migration story |
| **Spec** | OpenAPI 3.1 via @fastify/swagger | Auto-generated from route schemas |
| **Client codegen** | openapi-typescript + openapi-fetch | Zero-runtime type-safe fetch client |
| **Desktop app** | Electron + React | Cross-platform, can control OBS, bundle FFmpeg |
| **Web dashboard** | Next.js (static export) | Fast, no server runtime needed |
| **Video player** | Video.js + videojs-markers + hls.js | Timeline markers, HLS streaming |
| **Storage** | Local disk / MinIO (S3) | Pluggable via interface |
| **Reverse proxy** | Caddy | Auto-HTTPS, simple config |
| **Containers** | Docker Compose | One-command deploy |
| **Monorepo (server)** | Turborepo | Manages API + web within server repo |
| **CI** | GitHub Actions | Spec generation, breaking change check, Docker build |
