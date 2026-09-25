# Development setup

## Prerequisites

- **Node 22 LTS** (`nvm install 22`)
- **Go 1.23+** (for the bridge)
- **Docker** (for Postgres in tests and the full stack)

## Repository layout

```
backend/          Node/TS Fastify server + Svelte SPA
  src/            server source
  frontend/       Svelte 5 frontend (built into backend/frontend/dist/)
  Dockerfile      multi-stage image (backend + frontend)
  docker-compose.yaml
bridge/           Go binary that talks to Board Manager
schema/           adbridge/v1 JSON Schema + generated TS types
docs/             architecture and design notes
fixtures/         recorded Board Manager frames (used in bridge tests)
```

## Backend

```bash
cd backend
npm install
```

### Run tests

The DB tests (`src/db/queries.test.ts`) require a live Postgres. Start one with Docker:

```bash
docker run -d --name dartcade-test-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dartcade_test \
  -p 5432:5432 \
  postgres:16-alpine
```

Then run all tests:

```bash
npm test
```

The default connection string is `postgres://postgres:postgres@localhost:5432/dartcade_test`.
Override it with `TEST_DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgres://... npm test
```

### Dev server

Requires a running Postgres and the two env vars:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade \
BRIDGE_SECRET=devsecret \
npm run dev
```

The backend serves at `http://localhost:3000`. Migrations run automatically on startup.

### Frontend dev (with hot reload)

In a second terminal:

```bash
cd backend/frontend
npm install
npm run dev   # Vite at http://localhost:5173, proxies /api and /ws to :3000
```

### Regenerate TS types from the schema

```bash
cd backend
npm run gen:types   # writes backend/src/schema/types.ts
```

## Bridge

```bash
cd bridge
go test ./...
go run ./cmd/bridge --help
```

## Full stack (Docker)

```bash
cd backend
cp .env.example .env   # or set POSTGRES_PASSWORD and BRIDGE_SECRET manually
POSTGRES_PASSWORD=secret BRIDGE_SECRET=secret docker compose up --build
```

Backend at `http://localhost:3000`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (runtime) | Postgres connection string |
| `BRIDGE_SECRET` | Yes (runtime) | Shared secret for bridge WebSocket auth |
| `PORT` | No (default `3000`) | HTTP/WS listen port |
| `TEST_DATABASE_URL` | No | Override DB URL for `npm test` |
