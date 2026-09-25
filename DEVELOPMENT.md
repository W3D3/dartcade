# Development setup

## Prerequisites

- **Docker** — runs the full dev stack
- **Node 22 LTS** (`nvm install 22`) — for running backend tests locally
- **Go 1.23+** — for working on the bridge outside Docker

## Repository layout

```
backend/              Node/TS Fastify server + Svelte SPA
  src/                server source
  frontend/           Svelte 5 frontend (Vite dev server or built dist/)
  Dockerfile          multi-stage production image
  docker-compose.yaml production compose (backend + postgres)
bridge/               Go binary that talks to Board Manager
  Dockerfile          bridge image (used by dev compose)
schema/               adbridge/v1 JSON Schema + generated TS types
docker-compose.dev.yaml  dev compose (postgres + backend + frontend + bridge)
.env.example          env var template
```

## Running the full dev stack

```bash
cp .env.example .env
# Edit .env — set DARTCADE_BOARD_URL to your board's local IP
docker compose -f docker-compose.dev.yaml up --build
```

| Service  | URL                        | Notes                          |
|----------|----------------------------|--------------------------------|
| frontend | http://localhost:5173      | Vite hot-reload                |
| backend  | http://localhost:3000      | tsx watch hot-reload           |
| postgres | localhost:5432             | user/pass: dartgames/dev       |
| bridge   | —                          | connects to your board on LAN  |

Once the bridge connects, open http://localhost:5173, pick your board in the dropdown, add players, and start a game.

## Environment variables

`.env` (copied from `.env.example`):

| Variable             | Required | Description                                           |
|----------------------|----------|-------------------------------------------------------|
| `DARTCADE_BOARD_URL` | Yes      | Board Manager URL, e.g. `http://192.168.1.x:3180`    |
| `BRIDGE_SECRET`      | No       | Shared secret for bridge auth (default: `devsecret`) |

Backend-only (set automatically by the dev compose, documented here for manual runs):

| Variable           | Description                              |
|--------------------|------------------------------------------|
| `DATABASE_URL`     | Postgres connection string               |
| `PORT`             | HTTP/WS listen port (default `3000`)     |
| `TEST_DATABASE_URL`| Override DB URL for `npm test`           |

## Running backend tests

The DB tests require a live Postgres:

```bash
docker run -d --name dartcade-test-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=dartcade_test \
  -p 5432:5432 postgres:16-alpine

cd backend && npm install && npm test
```

Override the connection string if needed:
```bash
TEST_DATABASE_URL=postgres://... npm test
```

## Bridge (Go)

```bash
cd bridge
go test ./...
go run ./cmd/bridge --help
```

## Regenerate TS types from the schema

```bash
cd backend
npm run gen:types   # writes backend/src/schema/types.ts
```

## Production build

```bash
cd backend
POSTGRES_PASSWORD=secret BRIDGE_SECRET=secret docker compose up --build
```
